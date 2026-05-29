(function initRustAiCoreBreoganTab(globalScope) {
  const DEFAULTS = {
    containerSelector: '#breogan-tab-container',
    iframeId: 'breogan-tab-frame',
    breoganUrl: 'https://breogan.celtiaia.com/?embed=1&host=rust-ai-core',
    targetOrigin: 'https://breogan.celtiaia.com'
  };

  function createIframe(options) {
    const host = document.querySelector(options.containerSelector);
    if (!host) {
      throw new Error('Breogan integration: container not found.');
    }

    let iframe = document.getElementById(options.iframeId);
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = options.iframeId;
      iframe.title = 'Breogan Tab';
      iframe.src = options.breoganUrl;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.minHeight = '720px';
      iframe.style.border = '0';
      iframe.style.background = '#f5f2e8';
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      host.appendChild(iframe);
    }

    return iframe;
  }

  function init(userOptions) {
    const options = Object.assign({}, DEFAULTS, userOptions || {});
    const iframe = createIframe(options);

    function send(type, payload) {
      if (!iframe.contentWindow) {
        return;
      }

      iframe.contentWindow.postMessage(
        {
          source: 'rust-ai-core',
          type: type,
          payload: payload || {}
        },
        options.targetOrigin
      );
    }

    function onMessage(event) {
      if (event.origin !== options.targetOrigin) {
        return;
      }

      const data = event.data;
      if (!data || data.source !== 'breogan-tab') {
        return;
      }

      const customEvent = new CustomEvent('breogan-tab-event', { detail: data });
      window.dispatchEvent(customEvent);

      if (data.type === 'breogan-ready') {
        send('breogan-get-state', {});
      }
    }

    window.addEventListener('message', onMessage);

    return {
      iframe: iframe,
      dispose: function dispose() {
        window.removeEventListener('message', onMessage);
      },
      getState: function getState() {
        send('breogan-get-state', {});
      },
      setAgent: function setAgent(agent) {
        send('breogan-set-agent', { agent: agent });
      },
      setTask: function setTask(task) {
        send('breogan-set-task', { task: task });
      },
      applyConfig: function applyConfig(config) {
        send('breogan-apply-config', { config: config });
      },
      runTask: function runTask(task, agent, taskId) {
        send('breogan-run-task', {
          task: task,
          agent: agent,
          taskId: taskId || null
        });
      }
    };
  }

  globalScope.BreoganTabIntegration = {
    init: init
  };
})(window);
