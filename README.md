# breogan
la creacion e implementacion de agentes ias en distintos sitios ias para ayudarles en sus tareas automatizaciones etc

## Integracion inicial de Breogan en UI

Se implemento una primera integracion funcional en la app estatica con estos elementos:

- Panel de configuracion Breogan con parametros operativos:
  - Activacion del motor
  - Estado de usuario premium
  - Modo (`analytical`, `creative`, `autonomous`)
  - Prioridad de ejecucion
  - Memoria asignada en MB
  - Limite de tokens premium
- Persistencia de configuracion en `localStorage` (clave `breogan.service.config.v1`).
- Consola de eventos Breogan en tiempo real dentro del panel.
- Enrutamiento inteligente de tareas complejas:
  - Si la tarea es compleja y el usuario es premium, se delega al motor Breogan.
  - Si no, responde el agente seleccionado por flujo estandar.

## Criterio actual de complejidad

Una tarea se marca como compleja si:

- El texto supera un umbral de longitud, o
- Contiene patrones de trabajo tecnico (auditoria, migracion, edge function, BFF, Rust, etc.).

## Siguiente paso recomendado

Conectar el orquestador de `script.js` con un endpoint real (Supabase Edge Function o BFF Fastify) para reemplazar la simulacion y ejecutar tareas reales de Breogan con trazabilidad.

## Infraestrutura Supabase engadida

Engadiuse unha base funcional para delegacion efectiva, segura e auditable:

- Edge Function: `supabase/functions/breogan-orchestrator/index.ts`
- Contrato SQL: `supabase/sql/breogan_tasks.sql`

### Que valida a Edge Function

- Sesion valida via `Authorization: Bearer <jwt>`.
- Perfil en `profiles` e permisos:
  - `subscription_level = premium`, ou
  - `role = admin`.

### Que audita

Cada execucion garda:

- `task_type`
- `payload`
- `result`
- `latency_ms`
- `estimated_cost`
- `execution_mode`
- `user_id`

Ademais, escribe un resumo en `diagnostics`.

## Frontend: modo simulation/edge

No panel de Breogan agora hai:

- Modo `simulation` (local)
- Modo `edge` (real)
- URL da function
- JWT de acceso

Se a tarefa e complexa e o usuario e premium, delegase no servizo seleccionado. Tamén existe auto-heal: se a latencia supera 2000ms, lanzase unha tarefa de `context-optimization`.

## Despregue rapido da function

1. Crear a taboa e politicas no SQL Editor con `supabase/sql/breogan_tasks.sql`.
1. Despregar a function con `supabase functions deploy breogan-orchestrator`.
1. Configurar secrets se fai falta: `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
1. No panel web, poñer a URL `https://<project-ref>.supabase.co/functions/v1/breogan-orchestrator` e un JWT dun usuario autenticado premium/admin.

## Proba E2E cloud (workspace)

Estado actual (produción):

- Function con verificación JWT activa no gateway.
- Secret remoto `BREOGAN_DEV_BYPASS_AUTH=false`.

Comportamento esperado:

- Sen `Authorization` devolve `401`.
- Con `Authorization: Bearer <jwt>` válido (usuario premium/admin) procesa tarefa e audita en `public.breogan_tasks`.

Nota técnica: o modo bridge/bypass úsase só para depuración puntual e non debe quedar activo en produción.

## Entorno local profesional (VS Code Tasks)

Engadiuse a task runner en:

- `../.vscode/tasks.json`

Inclue:

- `Servidor Local Breogan (CORS Real)` para arrancar Vite en `http://localhost:5174`.
- `Supabase Edge Functions Local` para servir `breogan-orchestrator` en `http://localhost:54321`.

Nota: a UI local mostra o título `Panel de Control - Agentes CeltIA` (páxina de investigación/axentes).

Co atallo `Ctrl+Shift+B` podes lanzar a task por defecto e probar o frontend en condicións reais de navegador.

## Proxy de depuracion local/cloud

Engadiuse:

- `breogan-debug-proxy.js`

Comportamento:

- Se estás en `localhost`, usa automaticamente `http://localhost:54321/functions/v1/breogan-orchestrator`.
- Fóra de local, usa a URL configurada no panel.
- Se non hai URL no panel, pode usar `window.BREOGAN_SUPABASE_URL` como fallback cloud.
