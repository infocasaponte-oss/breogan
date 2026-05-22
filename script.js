const agents = {
    coord: { name: "Coordinador", role: "Gestión", color: "#2d7a4a" },
    coder: { name: "Programador", role: "Código", color: "#1976d2" },
    writer: { name: "Redactor", role: "Contenido", color: "#d32f2f" },
    analyst: { name: "Analista", role: "Datos", color: "#fbc02d" }
};

const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const agentSelector = document.getElementById('agent-selector');

function addMessage(text, sender, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<strong>${sender}:</strong> <br> ${text}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updateAgentStatus(agentId, status) {
    const cards = document.querySelectorAll('.agent-card');
    cards.forEach(c => c.classList.remove('active'));
    
    const card = document.getElementById(`card-${agentId}`);
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

    if (!text) return;

    // Mensaje del usuario
    addMessage(text, 'Tú', 'user');
    userInput.value = '';

    // Estado del agente
    updateAgentStatus(agentKey, 'working');
    
    // Simulación de "procesamiento" de la IA
    setTimeout(() => {
        let response = "";
        switch(agentKey) {
            case 'coder': 
                response = "He analizado tu petición. Aquí tienes el fragmento de código solicitado bajo los estándares de CeltIA...";
                break;
            case 'writer':
                response = "He redactado el borrador solicitado manteniendo el tono de marca...";
                break;
            case 'analyst':
                response = "Tras procesar los datos, los patrones indican una eficiencia del 85%...";
                break;
            default:
                response = "Recibido. Voy a coordinar esta tarea con el equipo especializado.";
        }
        
        addMessage(response, agent.name, 'agent');
        updateAgentStatus(agentKey, 'online');
    }, 1500);
}

sendBtn.addEventListener('click', handleTask);

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleTask();
    }
});