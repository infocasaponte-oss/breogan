(function () {
  function getLocalBridgePort() {
    const storagePort = window.localStorage.getItem("breogan.bridge.port");
    const windowPort = window.BREOGAN_BRIDGE_PORT;
    const raw = storagePort || windowPort || "8081";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
      return 8081;
    }
    return parsed;
  }

  async function debugBreoganCall(task, payload) {
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const cloudBaseUrl = window.BREOGAN_SUPABASE_URL || "";
    const cloudEndpoint = cloudBaseUrl
      ? `${cloudBaseUrl.replace(/\/$/, "")}/functions/v1/breogan-orchestrator`
      : "";

    const localPort = getLocalBridgePort();
    const localEndpoint = `http://localhost:${localPort}/functions/v1/breogan-orchestrator`;
    const endpoint = isLocal ? localEndpoint : cloudEndpoint;

    console.log(
      `[BREOGAN DEBUG] tarefa=${task} modo=${isLocal ? "LOCAL" : "CLOUD"} endpoint=${endpoint || "non-configurado"}`,
      payload,
    );

    return { endpoint, isLocal };
  }

  window.debugBreoganCall = debugBreoganCall;
})();
