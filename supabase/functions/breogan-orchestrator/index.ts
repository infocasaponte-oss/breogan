import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-breogan-bridge, x-breogan-user-id",
};

type BreoganPayload = {
  taskType: string;
  payload: Record<string, unknown>;
};

type ActorContext = {
  userId: string | null;
  isPremium: boolean;
  isAdmin: boolean;
  authMode: "jwt" | "bridge";
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveActor(req: Request, supabaseClient: ReturnType<typeof createClient> | null, allowBridgeBypass: boolean) {
  const bridgeHeader = req.headers.get("x-breogan-bridge") ?? "";
  const bridgeUserId = req.headers.get("x-breogan-user-id")?.trim() ?? "";

  if (allowBridgeBypass && bridgeHeader === "local-dev") {
    return {
      userId: bridgeUserId || null,
      isPremium: true,
      isAdmin: true,
      authMode: "bridge",
    } satisfies ActorContext;
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "").trim()
    : "";

  if (!jwt) {
    return jsonResponse({ error: "Acceso non autorizado" }, 401);
  }

  if (!supabaseClient) {
    throw new Error("Supabase client is required for authenticated requests");
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser(jwt);

  if (authError || !user) {
    return jsonResponse({ error: "Non autorizado" }, 401);
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("subscription_level, role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Profile lookup failed: ${profileError.message}`);
  }

  const isAdmin = profile?.role === "admin";
  return {
    userId: user.id,
    isPremium: profile?.subscription_level === "premium" || isAdmin,
    isAdmin,
    authMode: "jwt",
  } satisfies ActorContext;
}

async function runOllamaInference(taskType: string, payload: Record<string, unknown>) {
  const ollamaBaseUrl = (Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const ollamaModel = Deno.env.get("OLLAMA_MODEL") ?? "llama3:8b";
  const prompt = typeof payload.prompt === "string"
    ? payload.prompt
    : JSON.stringify(payload);

  const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      prompt: `You are Breogan orchestrator. Respond in Galician/Spanish mixed style, concise and technical when needed. Task type: ${taskType}. User request: ${prompt}`,
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama error ${response.status}: ${body.slice(0, 240)}`);
  }

  const json = await response.json();
  const answer = typeof json?.response === "string" ? json.response.trim() : "";
  if (!answer) {
    throw new Error("Ollama returned empty response");
  }

  return {
    provider: "ollama",
    model: ollamaModel,
    answer,
  };
}

async function runOpenAiCompatibleInference(taskType: string, payload: Record<string, unknown>) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const endpoint = (Deno.env.get("LOVABLE_BASE_URL") ?? "https://api.openai.com/v1/chat/completions").replace(/\/$/, "");
  const model = Deno.env.get("LOVABLE_MODEL") ?? "gpt-4o-mini";
  const prompt = typeof payload.prompt === "string"
    ? payload.prompt
    : JSON.stringify(payload);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are Breogan orchestrator. Keep responses practical and concise." },
        { role: "user", content: `Task type: ${taskType}. Request: ${prompt}` },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI-compatible error ${response.status}: ${body.slice(0, 240)}`);
  }

  const json = await response.json();
  const answer = json?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("OpenAI-compatible backend returned empty response");
  }

  return {
    provider: "openai-compatible",
    model,
    answer: answer.trim(),
  };
}

async function runBreoganInference(taskType: string, payload: Record<string, unknown>) {
  const preferred = (Deno.env.get("BREOGAN_AI_PROVIDER") ?? "ollama").toLowerCase();
  const hasOpenAiKey = Boolean((Deno.env.get("LOVABLE_API_KEY") ?? "").trim());

  if (preferred === "openai") {
    if (!hasOpenAiKey) {
      return await runOllamaInference(taskType, payload);
    }

    try {
      return await runOpenAiCompatibleInference(taskType, payload);
    } catch (_error) {
      return await runOllamaInference(taskType, payload);
    }
  }

  try {
    return await runOllamaInference(taskType, payload);
  } catch (ollamaError) {
    if (!hasOpenAiKey) {
      throw ollamaError;
    }

    return await runOpenAiCompatibleInference(taskType, payload);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalBridgeRequest(req: Request, allowBridgeBypass: boolean) {
  return allowBridgeBypass && (req.headers.get("x-breogan-bridge") ?? "") === "local-dev";
}

function getLocalTaskCachePath() {
  return Deno.env.get("BREOGAN_LOCAL_TASK_CACHE") ?? `${Deno.cwd()}/.breogan-task-cache.json`;
}

async function readLocalTaskCache() {
  try {
    const raw = await Deno.readTextFile(getLocalTaskCachePath());
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function writeLocalTaskCache(tasks: unknown[]) {
  await Deno.writeTextFile(getLocalTaskCachePath(), JSON.stringify(tasks, null, 2));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const allowBridgeBypass = (Deno.env.get("BREOGAN_DEV_BYPASS_AUTH") ?? "false") === "true";
    const localBridgeRequest = isLocalBridgeRequest(req, allowBridgeBypass);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!localBridgeRequest && (!supabaseUrl || !serviceRoleKey)) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }

    const supabaseClient = localBridgeRequest ? null : createClient(supabaseUrl, serviceRoleKey);

    const actorOrResponse = await resolveActor(req, supabaseClient, allowBridgeBypass);
    if (actorOrResponse instanceof Response) {
      return actorOrResponse;
    }

    const actor = actorOrResponse;

    if (req.method === "GET") {
      const url = new URL(req.url);
      const requestedLimit = Number(url.searchParams.get("limit") ?? "8");
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 25)
        : 8;

      if (actor.authMode === "bridge") {
        const localTasks = await readLocalTaskCache();
        return jsonResponse({ tasks: localTasks.slice(0, limit) });
      }

      let query = supabaseClient!
        .from("breogan_tasks")
        .select("id, user_id, task_type, status, latency_ms, estimated_cost, payload, result, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!actor.isAdmin && actor.userId) {
        query = query.eq("user_id", actor.userId);
      }

      const { data: tasks, error: tasksError } = await query;
      if (tasksError) {
        throw new Error(`Tasks query failed: ${tasksError.message}`);
      }

      return jsonResponse({ tasks: tasks ?? [] });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = (await req.json()) as BreoganPayload;
    const taskType = typeof body.taskType === "string" ? body.taskType : "unknown";
    const payload = body.payload ?? {};

    const startTime = performance.now();
    const processingTime = actor.isPremium ? 200 : 1000;
    await sleep(processingTime);

    const inference = await runBreoganInference(taskType, payload);
    const result = {
      status: "success",
      data: inference.answer,
      provider: inference.provider,
      model: inference.model,
    };

    const latencyMs = performance.now() - startTime;
    const estimatedCost = actor.isPremium ? 0 : Number((latencyMs * 0.00005).toFixed(5));

    const localTaskRecord = {
      id: crypto.randomUUID(),
      user_id: actor.userId,
      task_type: taskType,
      status: "completed",
      latency_ms: Number(latencyMs.toFixed(2)),
      estimated_cost: estimatedCost,
      payload,
      result,
      created_at: new Date().toISOString(),
    };

    if (actor.authMode === "bridge") {
      const localTasks = await readLocalTaskCache();
      localTasks.unshift(localTaskRecord);
      await writeLocalTaskCache(localTasks.slice(0, 25));
      return jsonResponse(localTaskRecord, 200);
    }

    const auditInsert = {
      user_id: actor.userId,
      task_type: taskType,
      status: "completed",
      latency_ms: Number(latencyMs.toFixed(2)),
      estimated_cost: estimatedCost,
      payload,
      result,
    };

    const { data: taskRecord, error: auditError } = await supabaseClient!
      .from("breogan_tasks")
      .insert(auditInsert)
      .select()
      .single();

    if (auditError) {
      throw new Error(`Audit insert failed: ${auditError.message}`);
    }

    await supabaseClient!.from("diagnostics").insert({
      level: "info",
      message: `Breogan Task: ${taskType}`,
      details: {
        user_id: actor.userId,
        breogan_task_id: taskRecord.id,
        premium_profile: actor.isPremium,
        auth_mode: actor.authMode,
        latency_ms: Number(latencyMs.toFixed(2)),
        cost: estimatedCost,
      },
    });

    return jsonResponse(taskRecord, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 400);
  }
});
