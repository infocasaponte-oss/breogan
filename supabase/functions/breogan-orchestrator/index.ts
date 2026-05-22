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
  authMode: "jwt" | "bridge";
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const allowBridgeBypass = (Deno.env.get("BREOGAN_DEV_BYPASS_AUTH") ?? "false") === "true";
    const bridgeHeader = req.headers.get("x-breogan-bridge") ?? "";
    const bridgeUserId = req.headers.get("x-breogan-user-id")?.trim() ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "").trim()
      : "";

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

    let actor: ActorContext;

    if (allowBridgeBypass && bridgeHeader === "local-dev") {
      actor = {
        userId: bridgeUserId || null,
        isPremium: true,
        authMode: "bridge",
      };
    } else {
      if (!jwt) {
        return new Response(JSON.stringify({ error: "Acceso non autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser(jwt);

      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Non autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("subscription_level, role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        throw new Error(`Profile lookup failed: ${profileError.message}`);
      }

      actor = {
        userId: user.id,
        isPremium: profile?.subscription_level === "premium" || profile?.role === "admin",
        authMode: "jwt",
      };
    }

    const body = (await req.json()) as BreoganPayload;
    const taskType = typeof body.taskType === "string" ? body.taskType : "unknown";
    const payload = body.payload ?? {};

    const startTime = performance.now();
    const processingTime = actor.isPremium ? 200 : 1000;
    await sleep(processingTime);

    // Placeholder for real Breogan execution.
    const result = {
      status: "success",
      data: "Procesamento Breogan completado",
    };

    const latencyMs = performance.now() - startTime;
    const estimatedCost = actor.isPremium ? 0 : Number((latencyMs * 0.00005).toFixed(5));

    const auditInsert = {
      user_id: actor.userId,
      task_type: taskType,
      status: "completed",
      latency_ms: Number(latencyMs.toFixed(2)),
      estimated_cost: estimatedCost,
      payload,
      result,
    };

    const { data: taskRecord, error: auditError } = await supabaseClient
      .from("breogan_tasks")
      .insert(auditInsert)
      .select()
      .single();

    if (auditError) {
      throw new Error(`Audit insert failed: ${auditError.message}`);
    }

    await supabaseClient.from("diagnostics").insert({
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

    return new Response(JSON.stringify(taskRecord), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
