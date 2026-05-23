const agents = {
    breogan: { name: "Breogan", role: "Orquestacion", color: "#f25f5c" },
    coord: { name: "Coordinador", role: "Gestión", color: "#2d7a4a" },
    coder: { name: "Programador", role: "Código", color: "#1976d2" },
    writer: { name: "Redactor", role: "Contenido", color: "#d32f2f" },
    analyst: { name: "Analista", role: "Datos", color: "#fbc02d" }
};

const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const agentSelector = document.getElementById('agent-selector');
const premiumToggle = document.getElementById('premium-toggle');
const breoganActive = document.getElementById('breogan-active');
const breoganMode = document.getElementById('breogan-mode');
const breoganPriority = document.getElementById('breogan-priority');
const breoganMemory = document.getElementById('breogan-memory');
const breoganTokenLimit = document.getElementById('breogan-token-limit');
const breoganExecutionMode = document.getElementById('breogan-execution-mode');
const breoganFunctionUrl = document.getElementById('breogan-function-url');
const breoganBridgePort = document.getElementById('breogan-bridge-port');
const breoganAccessToken = document.getElementById('breogan-access-token');
const saveBreoganConfigBtn = document.getElementById('save-breogan-config');
const priorityValue = document.getElementById('priority-value');
const memoryValue = document.getElementById('memory-value');
const breoganLog = document.getElementById('breogan-log');
const runPulseTestBtn = document.getElementById('run-pulse-test');
const pulseResult = document.getElementById('pulse-result');

const BREOGAN_CONFIG_KEY = 'breogan.service.config.v1';

const breoganConfig = {
    premiumUser: false,
    active: true,
    mode: 'analytical',
    priority: 5,
    memoryMb: 512,
    tokenLimit: 4096,
    executionMode: 'simulation',
    functionUrl: '',
    bridgePort: 8081,
    accessToken: ''
};

const runtimeHealth = {
    optimizing: false,
    recentLatenciesMs: []
};

const conversationState = {
    lastUserTask: '',
    lastEffectiveTask: '',
    lastAgent: 'coord',
    history: []
};

const integrationState = {
    embedded: false,
    parentOrigin: '*',
    lastTaskId: null
};

function initEmbeddedIntegration() {
    const params = new URLSearchParams(window.location.search);
    const requestedEmbed = params.get('embed') === '1' || params.get('host') === 'rust-ai-core';
    const insideIframe = window.self !== window.top;
    integrationState.embedded = requestedEmbed || insideIframe;
    integrationState.parentOrigin = params.get('origin') || '*';

    if (integrationState.embedded) {
        document.body.classList.add('embedded');
    }
}

function postToHost(eventType, payload = {}) {
    if (!integrationState.embedded || !window.parent || window.parent === window) {
        return;
    }

    window.parent.postMessage(
        {
            source: 'breogan-tab',
            type: eventType,
            payload,
            timestamp: new Date().toISOString()
        },
        integrationState.parentOrigin
    );
}

function collectUiState() {
    return {
        selectedAgent: agentSelector.value,
        config: { ...breoganConfig },
        runtime: {
            optimizing: runtimeHealth.optimizing,
            recentLatenciesMs: runtimeHealth.recentLatenciesMs.slice(0, 6)
        }
    };
}

function applyHostConfig(configPatch) {
    if (!configPatch || typeof configPatch !== 'object') {
        return;
    }

    if (typeof configPatch.premiumUser === 'boolean') breoganConfig.premiumUser = configPatch.premiumUser;
    if (typeof configPatch.active === 'boolean') breoganConfig.active = configPatch.active;
    if (['analytical', 'creative', 'autonomous'].includes(configPatch.mode)) breoganConfig.mode = configPatch.mode;
    if (Number.isFinite(Number(configPatch.priority))) breoganConfig.priority = Number(configPatch.priority);
    if (Number.isFinite(Number(configPatch.memoryMb))) breoganConfig.memoryMb = Number(configPatch.memoryMb);
    if (Number.isFinite(Number(configPatch.tokenLimit))) breoganConfig.tokenLimit = Number(configPatch.tokenLimit);
    if (configPatch.executionMode === 'edge' || configPatch.executionMode === 'simulation') breoganConfig.executionMode = configPatch.executionMode;
    if (typeof configPatch.functionUrl === 'string') breoganConfig.functionUrl = configPatch.functionUrl.trim();
    if (Number.isFinite(Number(configPatch.bridgePort))) breoganConfig.bridgePort = Number(configPatch.bridgePort);
    if (typeof configPatch.accessToken === 'string') breoganConfig.accessToken = configPatch.accessToken.trim();

    syncBreoganForm();
    saveBreoganConfig();
}

function handleHostMessage(event) {
    const data = event && event.data;
    if (!data || data.source !== 'rust-ai-core' || typeof data.type !== 'string') {
        return;
    }

    if (integrationState.parentOrigin === '*' && event.origin) {
        integrationState.parentOrigin = event.origin;
    }

    if (data.type === 'breogan-set-agent' && typeof data.payload?.agent === 'string') {
        const requestedAgent = data.payload.agent;
        if (agents[requestedAgent]) {
            agentSelector.value = requestedAgent;
        }
        return;
    }

    if (data.type === 'breogan-set-task' && typeof data.payload?.task === 'string') {
        userInput.value = data.payload.task;
        return;
    }

    if (data.type === 'breogan-apply-config' && data.payload?.config) {
        applyHostConfig(data.payload.config);
        return;
    }

    if (data.type === 'breogan-get-state') {
        postToHost('breogan-state', collectUiState());
        return;
    }

    if (data.type === 'breogan-run-task') {
        if (typeof data.payload?.task === 'string') {
            userInput.value = data.payload.task;
        }
        if (typeof data.payload?.agent === 'string' && agents[data.payload.agent]) {
            agentSelector.value = data.payload.agent;
        }
        integrationState.lastTaskId = data.payload?.taskId || null;
        handleTask();
    }
}

function appendBreoganLog(text) {
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = 'log-line';
    div.textContent = `[${time}] ${text}`;
    breoganLog.prepend(div);

    while (breoganLog.children.length > 8) {
        breoganLog.removeChild(breoganLog.lastChild);
    }
}

function syncBreoganForm() {
    premiumToggle.checked = breoganConfig.premiumUser;
    breoganActive.checked = breoganConfig.active;
    breoganMode.value = breoganConfig.mode;
    breoganPriority.value = String(breoganConfig.priority);
    breoganMemory.value = String(breoganConfig.memoryMb);
    breoganTokenLimit.value = String(breoganConfig.tokenLimit);
    breoganExecutionMode.value = breoganConfig.executionMode;
    breoganFunctionUrl.value = breoganConfig.functionUrl;
    breoganBridgePort.value = String(breoganConfig.bridgePort);
    breoganAccessToken.value = breoganConfig.accessToken;
    priorityValue.textContent = String(breoganConfig.priority);
    memoryValue.textContent = String(breoganConfig.memoryMb);
}

function saveBreoganConfig() {
    localStorage.setItem(BREOGAN_CONFIG_KEY, JSON.stringify(breoganConfig));
    appendBreoganLog(
        `Config guardada | premium=${breoganConfig.premiumUser} mode=${breoganConfig.mode} priority=${breoganConfig.priority} memory=${breoganConfig.memoryMb}MB tokens=${breoganConfig.tokenLimit} exec=${breoganConfig.executionMode}`
    );
}

function loadBreoganConfig() {
    const raw = localStorage.getItem(BREOGAN_CONFIG_KEY);
    const runtimeToken = typeof window.BREOGAN_ACCESS_TOKEN === 'string' ? window.BREOGAN_ACCESS_TOKEN.trim() : '';
    const runtimeUrl = typeof window.BREOGAN_SUPABASE_URL === 'string' ? window.BREOGAN_SUPABASE_URL.trim() : '';
    const runtimePort = Number(window.BREOGAN_BRIDGE_PORT);

    if (!raw) {
        if (runtimeUrl && !breoganConfig.functionUrl) {
            breoganConfig.functionUrl = `${runtimeUrl.replace(/\/$/, '')}/functions/v1/breogan-orchestrator`;
        }
        if (runtimeToken && !breoganConfig.accessToken) {
            breoganConfig.accessToken = runtimeToken;
        }
        if (Number.isFinite(runtimePort) && runtimePort > 0 && runtimePort <= 65535) {
            breoganConfig.bridgePort = runtimePort;
        }
        localStorage.setItem('breogan.bridge.port', String(breoganConfig.bridgePort));
        syncBreoganForm();
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        breoganConfig.premiumUser = Boolean(parsed.premiumUser);
        breoganConfig.active = Boolean(parsed.active);
        breoganConfig.mode = ['analytical', 'creative', 'autonomous'].includes(parsed.mode) ? parsed.mode : 'analytical';
        breoganConfig.priority = Number(parsed.priority) || 5;
        breoganConfig.memoryMb = Number(parsed.memoryMb) || 512;
        breoganConfig.tokenLimit = Number(parsed.tokenLimit) || 4096;
        breoganConfig.executionMode = parsed.executionMode === 'edge' ? 'edge' : 'simulation';
        breoganConfig.functionUrl = typeof parsed.functionUrl === 'string' ? parsed.functionUrl : '';
        breoganConfig.bridgePort = Number(parsed.bridgePort) > 0 ? Number(parsed.bridgePort) : 8081;
        breoganConfig.accessToken = typeof parsed.accessToken === 'string' ? parsed.accessToken : '';

        if (!breoganConfig.functionUrl && runtimeUrl) {
            breoganConfig.functionUrl = `${runtimeUrl.replace(/\/$/, '')}/functions/v1/breogan-orchestrator`;
        }
        if (!breoganConfig.accessToken && runtimeToken) {
            breoganConfig.accessToken = runtimeToken;
        }
        if (Number.isFinite(runtimePort) && runtimePort > 0 && runtimePort <= 65535) {
            breoganConfig.bridgePort = runtimePort;
        }

        localStorage.setItem('breogan.bridge.port', String(breoganConfig.bridgePort));
        syncBreoganForm();
        appendBreoganLog('Config recuperada desde almacenamiento local.');
    } catch (error) {
        appendBreoganLog('No se pudo leer la config guardada, usando valores por defecto.');
        syncBreoganForm();
    }
}

function estimateComplexity(text) {
    const heavyPattern = /(auditoria|refactor|arquitectura|optimiza|migracion|debug|pipeline|microservicio|edge function|socket|supabase|bff|rust|vulnerab|segur|pentest|cve|ataque)/i;
    const hasHeavyIntent = heavyPattern.test(text);
    const lengthScore = text.length > 260;
    return hasHeavyIntent || lengthScore;
}

function isSecurityAssessmentRequest(text) {
    return /(vulnerab|segur|pentest|cve|ataque|auditor[ií]a de seguridad|security assessment|owasp)/i.test(text);
}

function isCollaborativeRequest(text) {
    return /(todos os axentes|todos los agentes|equipo completo|multiagente|pon a todos|activar todos)/i.test(text);
}

function isAffirmativeFollowUp(text) {
    const normalized = text.trim().toLowerCase();
    const shortFollowUps = ['adiante', 'adelante', 'dale', 'continua', 'continúa', 'sigue', 'ok', 'vale', 'go'];
    return shortFollowUps.includes(normalized) || (normalized.length <= 12 && /^(ok|go|si|sí)\b/.test(normalized));
}

function resolveEffectiveTask(rawText) {
    if (isAffirmativeFollowUp(rawText) && conversationState.lastEffectiveTask) {
        return conversationState.lastEffectiveTask;
    }
    return rawText;
}

function rememberConversation(userText, effectiveText, agentKey) {
    conversationState.lastUserTask = userText;
    conversationState.lastEffectiveTask = effectiveText;
    conversationState.lastAgent = agentKey;
    conversationState.history.unshift({
        at: Date.now(),
        userText,
        effectiveText,
        agentKey
    });
    conversationState.history = conversationState.history.slice(0, 10);
}

function buildBreoganResponse(taskText, delegatedAgentName) {
    const safePrompt = taskText.slice(0, 140);
    const modeLabel = {
        analytical: 'Analisis profundo',
        creative: 'Sintesis creativa',
        autonomous: 'Ejecucion autonoma'
    }[breoganConfig.mode];

    return `${modeLabel}: tarea delegada desde ${delegatedAgentName}.\n` +
        `Prioridad ${breoganConfig.priority}/10 | Memoria ${breoganConfig.memoryMb}MB | Limite ${breoganConfig.tokenLimit} tokens.\n` +
        `Resumen inicial: "${safePrompt}${taskText.length > 140 ? '...' : ''}"`;
}

function extractBreoganResultText(serviceResult) {
    const raw = serviceResult && serviceResult.raw ? serviceResult.raw : null;
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    if (typeof raw.result === 'string') {
        return raw.result;
    }

    if (raw.result && typeof raw.result === 'object') {
        if (typeof raw.result.data === 'string' && raw.result.data.trim()) {
            return raw.result.data.trim();
        }
        if (typeof raw.result.answer === 'string' && raw.result.answer.trim()) {
            return raw.result.answer.trim();
        }
    }

    if (typeof raw.data === 'string' && raw.data.trim()) {
        return raw.data.trim();
    }

    return null;
}

function isAuditRequest(text) {
    return /\b(audit(?:a|ar|oria)?|audita|ecosistem(?:a|o)?|estado|status|diagnostic(?:a|o)?|revisa|verifica)\b/i.test(text);
}

function isHealthRequest(text) {
    return /\b(saude|salud|health|ecosistem(?:a|o)?\s+en\s+salud|estado\s+del\s+ecosistem(?:a|o)?|salud\s+del\s+ecosistem(?:a|o)?)\b/i.test(text);
}

function buildAuditResponse(taskText, delegatedAgentName) {
    const resolvedEndpoint = breoganConfig.functionUrl ||
        (typeof window.BREOGAN_SUPABASE_URL === 'string' && window.BREOGAN_SUPABASE_URL.trim()
            ? `${window.BREOGAN_SUPABASE_URL.trim().replace(/\/$/, '')}/functions/v1/breogan-orchestrator`
            : 'sin configurar');

    const bridgeMode = isLocalBridgeEndpoint(resolvedEndpoint) || resolvedEndpoint.includes('localhost:8081');
    const readiness = breoganConfig.active && (breoganConfig.executionMode !== 'edge' || bridgeMode || Boolean(breoganConfig.accessToken));
    const tokenState = breoganConfig.accessToken ? 'configurado' : 'pendiente';

    return [
        `Auditoría inicial para ${delegatedAgentName}:`,
        `- Petición: ${taskText}`,
        `- Motor Breogan: ${breoganConfig.active ? 'activo' : 'inactivo'}`,
        `- Modo operativo: ${breoganConfig.mode}`,
        `- Ejecución: ${breoganConfig.executionMode}`,
        `- Endpoint: ${resolvedEndpoint}`,
        `- Bridge local: ${breoganConfig.bridgePort}`,
        `- JWT: ${tokenState}`,
        `- Estado operativo: ${readiness ? 'listo para coordinar' : 'requiere ajuste de configuración'}`,
        `Próximo paso: validar Supabase, permisos y trazabilidad de tareas antes de ejecutar cambios.`
    ].join('\n');
}

function buildFallbackResponse(agentKey, taskText) {
    if (isSecurityAssessmentRequest(taskText)) {
        const basePlan = [
            'Plan seguro de avaliación (sen dano no sistema):',
            '1. Descubrimento pasivo: fingerprint de versións, headers, TLS e superficie exposta.',
            '2. Escaneo non intrusivo: OWASP ZAP en modo pasivo + revisión de configuración.',
            '3. Contraste de risco: mapear achados a OWASP Top 10 e priorizar por impacto/probabilidade.',
            '4. Informe final: vulnerabilidade, evidencia, severidade, risco e recomendación de mitigación.',
            '5. Validación: repetir comprobación tras aplicar correccións para confirmar peche do risco.'
        ].join('\n');

        if (isCollaborativeRequest(taskText)) {
            return [
                'Activada orquestración multi-axente para auditoría de vulnerabilidades.',
                'Coordinador: define alcance, ventá de execución e regras de non impacto.',
                'Programador: prepara scripts de comprobación segura e recollida de evidencias.',
                'Analista: clasifica riscos (OWASP/CVSS) e prioriza remediación.',
                'Redactor: compón o informe executivo + técnico para entrega.',
                basePlan
            ].join('\n');
        }

        return basePlan;
    }

    switch (agentKey) {
    case 'coder':
        return [
            'Proposta técnica inicial preparada.',
            `Obxectivo: ${taskText}`,
            'Seguinte paso: definimos entrada/saída, validación e execución por fases con rollback seguro.'
        ].join('\n');
    case 'writer':
        return [
            'Borrador operativo xerado.',
            `Tema: ${taskText}`,
            'Podo entregalo en formato executivo, técnico ou mixto segundo audiencia.'
        ].join('\n');
    case 'analyst':
        return isAuditRequest(taskText)
            ? buildAuditResponse(taskText, agents[agentKey].name)
            : `Análise inicial completada sobre: ${taskText}\nSeguinte paso: métricas, hipótese e plan de validación.`;
    default:
        if (isCollaborativeRequest(taskText)) {
            return [
                'Coordinación de equipo activada.',
                `Tarefa: ${taskText}`,
                'Asignación: Programador (execución), Analista (validación), Redactor (entrega), Coordinador (seguimento).'
            ].join('\n');
        }

        return isAuditRequest(taskText)
            ? buildAuditResponse(taskText, agents[agentKey].name)
            : `Recibido. Voy a coordinar esta tarea con el equipo especializado y concretar los siguientes pasos.`;
    }
}

async function buildHealthResponse(taskText, delegatedAgentName) {
    const resolvedEndpoint = breoganConfig.functionUrl ||
        (typeof window.BREOGAN_SUPABASE_URL === 'string' && window.BREOGAN_SUPABASE_URL.trim()
            ? `${window.BREOGAN_SUPABASE_URL.trim().replace(/\/$/, '')}/functions/v1/breogan-orchestrator`
            : 'sin configurar');

    const healthyBridge = isLocalBridgeEndpoint(resolvedEndpoint) || resolvedEndpoint.includes('localhost:8081');
    const payload = {
        prompt: taskText,
        delegatedAgent: 'ecosystem-health',
        mode: breoganConfig.mode,
        priority: breoganConfig.priority,
        tokenLimit: breoganConfig.tokenLimit,
        memoryMb: breoganConfig.memoryMb,
        healthCheck: true
    };

    let serviceProbe = null;
    try {
        serviceProbe = breoganConfig.executionMode === 'edge'
            ? await callBreoganService('ecosystem-health', payload)
            : await simulateBreoganService('ecosystem-health', payload);
    } catch (error) {
        serviceProbe = {
            latencyMs: null,
            cost: null,
            error: error instanceof Error ? error.message : 'Erro descoñecido'
        };
    }

    const latency = serviceProbe && typeof serviceProbe.latencyMs === 'number'
        ? `${Number(serviceProbe.latencyMs).toFixed(2)}ms`
        : 'n/a';
    const cost = serviceProbe && serviceProbe.cost !== null && serviceProbe.cost !== undefined
        ? serviceProbe.cost
        : 'n/a';
    const outcome = serviceProbe && serviceProbe.error
        ? `con incidencias: ${serviceProbe.error}`
        : 'operativo';

    return [
        `Saúde do ecosistema para ${delegatedAgentName}:`,
        `- Petición: ${taskText}`,
        `- Motor Breogan: ${breoganConfig.active ? 'activo' : 'inactivo'}`,
        `- Modo operativo: ${breoganConfig.mode}`,
        `- Modo execución: ${breoganConfig.executionMode}`,
        `- Endpoint: ${resolvedEndpoint}`,
        `- Bridge local: ${healthyBridge ? 'dispoñible' : 'non detectado'}`,
        `- JWT: ${breoganConfig.accessToken ? 'configurado' : 'pendente'}`,
        `- Estado saúde: ${outcome}`,
        `- Latencia probe: ${latency}`,
        `- Custo probe: ${cost} CELT`,
        `- Acción suxerida: ${breoganConfig.active ? 'seguir monitorización e auditoría' : 'activar o motor Breogan'}`
    ].join('\n');
}

function getEcosystemServiceTargets(resolvedEndpoint) {
    return [
        { name: 'Breogan Edge', url: resolvedEndpoint, mode: 'cors' },
        { name: 'ROOT Supabase API', url: 'http://127.0.0.1:54321/auth/v1/health', mode: 'cors', fallbackNoCors: true },
        { name: 'BREOGAN Supabase API', url: 'http://127.0.0.1:8081/auth/v1/health', mode: 'cors', fallbackNoCors: true },
        { name: 'Frontend', url: window.location.origin, mode: 'cors' },
        { name: 'BFF API', url: 'http://localhost:8082/health', mode: 'cors' },
        { name: 'Native Engine', url: 'http://localhost:8088/engine/health', mode: 'cors', fallbackNoCors: true },
        { name: 'RaptorCom', url: 'http://localhost:8090/health', mode: 'cors', fallbackNoCors: true },
        { name: 'Ollama', url: 'http://localhost:11434/api/version', mode: 'cors' }
    ];
}

async function probeService(urlText, options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 1200;
    const mode = options.mode === 'no-cors' ? 'no-cors' : 'cors';
    const fallbackNoCors = Boolean(options.fallbackNoCors);
    const treat404AsUp = Boolean(options.treat404AsUp);

    const startedAt = performance.now();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(urlText, {
            method: 'GET',
            cache: 'no-store',
            mode,
            signal: controller.signal
        });

        if (response.status === 404 && treat404AsUp) {
            return {
                ok: true,
                status: response.status,
                latencyMs: performance.now() - startedAt,
                error: null,
                note: 'route-missing'
            };
        }

        return {
            ok: response.ok,
            status: response.status,
            latencyMs: performance.now() - startedAt,
            error: null,
            note: null
        };
    } catch (error) {
        if (fallbackNoCors && mode !== 'no-cors') {
            try {
                const opaqueStartedAt = performance.now();
                await fetch(urlText, {
                    method: 'GET',
                    cache: 'no-store',
                    mode: 'no-cors',
                    signal: controller.signal
                });

                return {
                    ok: true,
                    status: null,
                    latencyMs: performance.now() - opaqueStartedAt,
                    error: null,
                    note: 'opaque'
                };
            } catch (opaqueError) {
                return {
                    ok: false,
                    status: null,
                    latencyMs: performance.now() - startedAt,
                    error: opaqueError instanceof Error ? opaqueError.message : 'Erro descoñecido',
                    note: null
                };
            }
        }

        return {
            ok: false,
            status: null,
            latencyMs: performance.now() - startedAt,
            error: error instanceof Error ? error.message : 'Erro descoñecido',
            note: null
        };
    } finally {
        window.clearTimeout(timer);
    }
}

function formatProbeLine(name, probe) {
    const state = probe.ok ? 'UP' : 'DOWN';
    const latency = Number.isFinite(probe.latencyMs) ? `${probe.latencyMs.toFixed(2)}ms` : 'n/a';
    const statusText = probe.status === null ? 'no-resp' : String(probe.status);
    const errorText = probe.error ? ` | ${probe.error}` : '';
    const noteText = probe.note === 'opaque'
        ? ' | cors-fallback'
        : probe.note === 'route-missing'
            ? ' | route-missing'
            : '';
    return `- ${name}: ${state} (${statusText}, ${latency})${noteText}${errorText}`;
}

async function buildHealthSummary(taskText, delegatedAgentName, serviceResult) {
    const resolvedEndpoint = breoganConfig.functionUrl ||
        (typeof window.BREOGAN_SUPABASE_URL === 'string' && window.BREOGAN_SUPABASE_URL.trim()
            ? `${window.BREOGAN_SUPABASE_URL.trim().replace(/\/$/, '')}/functions/v1/breogan-orchestrator`
            : 'sin configurar');

    const targets = getEcosystemServiceTargets(resolvedEndpoint);
    const ecosystemProbes = await Promise.all(targets.map(async (target) => ({
        name: target.name,
        probe: target.name === 'Breogan Edge'
            ? {
                ok: true,
                status: 200,
                latencyMs: serviceResult && typeof serviceResult.latencyMs === 'number' ? serviceResult.latencyMs : 0,
                error: null,
                note: null
            }
            : await probeService(target.url, target)
    })));

    const healthyCount = ecosystemProbes.filter((item) => item.probe.ok).length;
    const totalCount = ecosystemProbes.length;
    const latency = serviceResult && typeof serviceResult.latencyMs === 'number'
        ? `${Number(serviceResult.latencyMs).toFixed(2)}ms`
        : 'n/a';
    const cost = serviceResult && serviceResult.cost !== null && serviceResult.cost !== undefined
        ? serviceResult.cost
        : 'n/a';

    return [
        `Saúde do ecosistema para ${delegatedAgentName}:`,
        `- Petición: ${taskText}`,
        `- Motor Breogan: ${breoganConfig.active ? 'activo' : 'inactivo'}`,
        `- Modo operativo: ${breoganConfig.mode}`,
        `- Modo execución: ${breoganConfig.executionMode}`,
        `- Endpoint: ${resolvedEndpoint}`,
        `- Bridge local: ${isLocalBridgeEndpoint(resolvedEndpoint) || resolvedEndpoint.includes('localhost:8081') ? 'dispoñible' : 'non detectado'}`,
        `- JWT: ${breoganConfig.accessToken ? 'configurado' : 'pendente'}`,
        `- Estado saúde: ${healthyCount}/${totalCount} servizos listos`,
        `- Latencia probe: ${latency}`,
        `- Custo probe: ${cost} CELT`,
        `- Acción suxerida: ${healthyCount === totalCount ? 'seguir monitorización e auditoría' : 'revisar os servizos caídos primeiro'}`,
        `- Detalle de probes:`,
        ...ecosystemProbes.map((item) => formatProbeLine(item.name, item.probe))
    ].join('\n');
}

function pushLatency(latencyMs) {
    runtimeHealth.recentLatenciesMs.unshift(latencyMs);
    runtimeHealth.recentLatenciesMs = runtimeHealth.recentLatenciesMs.slice(0, 6);
}

function isLocalBridgeEndpoint(urlText) {
    if (!urlText) {
        return false;
    }

    try {
        const parsed = new URL(urlText);
        return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    } catch (error) {
        return false;
    }
}

async function callBreoganService(taskType, payload) {
    let resolvedEndpoint = breoganConfig.functionUrl;
    let bridgeInfo = null;

    if (!resolvedEndpoint && typeof window.debugBreoganCall === 'function') {
        bridgeInfo = await window.debugBreoganCall(taskType, payload);
        resolvedEndpoint = bridgeInfo.endpoint;
    }

    if (!resolvedEndpoint) {
        throw new Error('Falta URL da function. Configuraa no panel ou define BREOGAN_SUPABASE_URL.');
    }

    const startedAt = performance.now();
    const headers = {
        'Content-Type': 'application/json'
    };

    if (breoganConfig.accessToken) {
        headers.Authorization = `Bearer ${breoganConfig.accessToken}`;
    } else if ((bridgeInfo && bridgeInfo.isLocal) || isLocalBridgeEndpoint(resolvedEndpoint)) {
        headers['x-breogan-bridge'] = 'local-dev';
    } else {
        throw new Error('Falta token JWT para execucion Edge.');
    }

    const response = await fetch(resolvedEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ taskType, payload })
    });

    const elapsed = performance.now() - startedAt;
    pushLatency(elapsed);

    let body = null;
    try {
        body = await response.json();
    } catch (error) {
        body = null;
    }

    if (!response.ok) {
        const message = body && body.error ? body.error : 'Erro no servizo Breogan';
        throw new Error(message);
    }

    const latencyFromBody = body && typeof body.latency_ms === 'number'
        ? body.latency_ms
        : body && typeof body.latency === 'number'
            ? body.latency
            : elapsed;
    const costFromBody = body && body.estimated_cost !== undefined
        ? body.estimated_cost
        : body && body.cost !== undefined
            ? body.cost
            : null;

    return {
        raw: body,
        latencyMs: Number(latencyFromBody),
        cost: costFromBody
    };
}

function simulateBreoganService(taskType, payload) {
    const simulatedLatency = 450 + Math.round(Math.random() * 1300);
    pushLatency(simulatedLatency);

    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                raw: {
                    result: {
                        status: 'success',
                        data: `Simulacion Breogan para tarefa ${taskType}`,
                        payloadEcho: payload
                    },
                    latency: simulatedLatency,
                    cost: (simulatedLatency * 0.0001).toFixed(5)
                },
                latencyMs: simulatedLatency,
                cost: (simulatedLatency * 0.0001).toFixed(5)
            });
        }, simulatedLatency);
    });
}

async function runContextOptimization(triggerLatencyMs) {
    if (runtimeHealth.optimizing || !breoganConfig.active || !breoganConfig.premiumUser) {
        return;
    }

    runtimeHealth.optimizing = true;
    appendBreoganLog(`Auto-heal activado por latencia alta (${triggerLatencyMs.toFixed(2)}ms).`);

    try {
        if (breoganConfig.executionMode === 'edge') {
            await callBreoganService('context-optimization', {
                reason: 'high-latency-detected',
                triggerLatencyMs,
                timestamp: new Date().toISOString()
            });
        }
        appendBreoganLog('Auto-heal completado. Contexto optimizado.');
    } catch (error) {
        appendBreoganLog(`Auto-heal fallo: ${error.message}`);
    } finally {
        setTimeout(() => {
            runtimeHealth.optimizing = false;
        }, 4000);
    }
}

async function maybeRunSelfHeal(lastLatencyMs) {
    if (lastLatencyMs <= 2000) {
        return;
    }
    await runContextOptimization(lastLatencyMs);
}

async function runPulseTest() {
    runPulseTestBtn.disabled = true;
    const previousText = runPulseTestBtn.textContent;
    runPulseTestBtn.textContent = 'Executando...';
    pulseResult.textContent = 'Probando núcleo Breogan...';

    try {
        const payload = { data: 'Probando nucleo de soberania Breogan' };
        const serviceResult = breoganConfig.executionMode === 'edge'
            ? await callBreoganService('stress-test', payload)
            : await simulateBreoganService('stress-test', payload);

        const latency = Number(serviceResult.latencyMs).toFixed(2);
        const cost = serviceResult.cost !== null && serviceResult.cost !== undefined
            ? serviceResult.cost
            : 'n/a';

        pulseResult.textContent = `Latencia: ${latency}ms | Custo: ${cost} CELT`;
        appendBreoganLog(`Pulse OK | latencia=${latency}ms cost=${cost}`);
    } catch (error) {
        pulseResult.textContent = `Erro: ${error.message}`;
        appendBreoganLog(`Pulse ERRO | ${error.message}`);
    } finally {
        runPulseTestBtn.disabled = false;
        runPulseTestBtn.textContent = previousText;
    }
}

function addMessage(text, sender, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<strong>${sender}:</strong> <br> ${text}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    postToHost('breogan-message', {
        sender,
        type,
        text,
        taskId: integrationState.lastTaskId
    });
}

function updateAgentStatus(agentId, status) {
    const cards = document.querySelectorAll('.agent-card');
    cards.forEach(c => c.classList.remove('active'));
    
    const card = document.getElementById(`card-${agentId}`);
    if (!card) return;
    const dot = card.querySelector('.status-dot');
    
    card.classList.add('active');
    
    if(status === 'working') {
        dot.className = 'status-dot working';
    } else {
        dot.className = 'status-dot online';
    }
}

async function handleTask() {
    const text = userInput.value.trim();
    const agentKey = agentSelector.value;
    const agent = agents[agentKey];
    const effectiveTaskText = resolveEffectiveTask(text);

    if (!text) return;

    // Mensaje del usuario
    addMessage(text, 'Tú', 'user');
    userInput.value = '';
    postToHost('breogan-task-started', {
        taskId: integrationState.lastTaskId,
        task: effectiveTaskText,
        agent: agentKey
    });

    rememberConversation(text, effectiveTaskText, agentKey);

    // Estado del agente
    updateAgentStatus(agentKey, 'working');

    const shouldDelegateToBreogan =
        breoganConfig.active &&
        (breoganConfig.premiumUser || isAuditRequest(effectiveTaskText) || isHealthRequest(effectiveTaskText) || estimateComplexity(effectiveTaskText));

    if (shouldDelegateToBreogan) {
        updateAgentStatus('breogan', 'working');
        appendBreoganLog(`Delegacion activada para tarea compleja (${agent.name}).`);
    }
    
    if (shouldDelegateToBreogan) {
        try {
            const taskType = agentKey === 'analyst' ? 'analysis' : agentKey === 'coder' ? 'automation' : 'heavy-compute';
            const payload = {
                prompt: effectiveTaskText,
                delegatedAgent: agentKey,
                mode: breoganConfig.mode,
                priority: breoganConfig.priority,
                tokenLimit: breoganConfig.tokenLimit,
                memoryMb: breoganConfig.memoryMb
            };

            const serviceResult = breoganConfig.executionMode === 'edge'
                ? await callBreoganService(taskType, payload)
                : await simulateBreoganService(taskType, payload);

            const realEdgeNarrative = extractBreoganResultText(serviceResult);
            const response = isHealthRequest(text)
                ? await buildHealthSummary(effectiveTaskText, agent.name, serviceResult)
                : isAuditRequest(effectiveTaskText)
                    ? buildAuditResponse(effectiveTaskText, agent.name)
                    : (realEdgeNarrative || buildBreoganResponse(effectiveTaskText, agent.name));
            addMessage(response, 'Breogan', 'breogan');
            addMessage('Coordinacion completada. El equipo ya tiene el plan de ejecucion.', 'Coordinador', 'agent');
            appendBreoganLog(
                `Tarefa completada | latencia=${Number(serviceResult.latencyMs).toFixed(2)}ms cost=${serviceResult.cost || 'n/a'}`
            );
            await maybeRunSelfHeal(Number(serviceResult.latencyMs));
        } catch (error) {
            addMessage(`Erro Breogan: ${error.message}`, 'Sistema', 'system');
            appendBreoganLog(`Erro de delegacion: ${error.message}`);
            postToHost('breogan-task-failed', {
                taskId: integrationState.lastTaskId,
                task: effectiveTaskText,
                agent: agentKey,
                error: error.message
            });
        } finally {
            updateAgentStatus('breogan', 'online');
            updateAgentStatus(agentKey, 'online');
            postToHost('breogan-task-finished', {
                taskId: integrationState.lastTaskId,
                task: effectiveTaskText,
                agent: agentKey,
                delegated: true
            });
            integrationState.lastTaskId = null;
        }
        return;
    }

    setTimeout(() => {
        const response = buildFallbackResponse(agentKey, effectiveTaskText);
        addMessage(response, agent.name, 'agent');
        updateAgentStatus(agentKey, 'online');
        postToHost('breogan-task-finished', {
            taskId: integrationState.lastTaskId,
            task: effectiveTaskText,
            agent: agentKey,
            delegated: false
        });
        integrationState.lastTaskId = null;
    }, 1500);
}

sendBtn.addEventListener('click', handleTask);

saveBreoganConfigBtn.addEventListener('click', () => {
    saveBreoganConfig();
});

premiumToggle.addEventListener('change', (event) => {
    breoganConfig.premiumUser = event.target.checked;
});

breoganActive.addEventListener('change', (event) => {
    breoganConfig.active = event.target.checked;
});

breoganMode.addEventListener('change', (event) => {
    breoganConfig.mode = event.target.value;
});

breoganPriority.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    breoganConfig.priority = value;
    priorityValue.textContent = String(value);
});

breoganMemory.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    breoganConfig.memoryMb = value;
    memoryValue.textContent = String(value);
});

breoganTokenLimit.addEventListener('change', (event) => {
    const value = Number(event.target.value);
    breoganConfig.tokenLimit = value > 0 ? value : 4096;
});

breoganExecutionMode.addEventListener('change', (event) => {
    breoganConfig.executionMode = event.target.value === 'edge' ? 'edge' : 'simulation';
});

breoganFunctionUrl.addEventListener('change', (event) => {
    breoganConfig.functionUrl = event.target.value.trim();
});

breoganBridgePort.addEventListener('change', (event) => {
    const value = Number(event.target.value);
    breoganConfig.bridgePort = value > 0 && value <= 65535 ? value : 8081;
    localStorage.setItem('breogan.bridge.port', String(breoganConfig.bridgePort));
});

breoganAccessToken.addEventListener('change', (event) => {
    breoganConfig.accessToken = event.target.value.trim();
});

runPulseTestBtn.addEventListener('click', runPulseTest);

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleTask();
    }
});

loadBreoganConfig();
appendBreoganLog('Orquestador disponible para enrutamiento premium.');
initEmbeddedIntegration();
window.addEventListener('message', handleHostMessage);
postToHost('breogan-ready', collectUiState());