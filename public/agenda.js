(() => {
  let selectedDay = null;
  let selectedSlot = null;
  const slots = ['09:00', '10:30', '12:00', '15:00', '16:30', '18:00'];
  const days = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  while (days.length < 4) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== 0) {
      days.push({
        key: cursor.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).format(cursor),
        unavailable: days.length === 2 ? [1, 4] : (days.length === 1 ? [0, 3] : [2])
      });
    }
  }

  function render() {
    const dayList = document.getElementById('appointment-day-list');
    const slotList = document.getElementById('appointment-slot-list');
    const title = document.getElementById('appointment-slot-title');
    if (!dayList || !slotList || !title) return;
    dayList.innerHTML = days.map(day => {
      const active = day.key === selectedDay;
      return `<button type="button" onclick="selectAgendaDay('${day.key}')" class="p-2.5 rounded-lg border text-left transition ${active ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600' : 'border-slate-200 bg-white hover:border-emerald-300 text-slate-700'}"><span class="block text-[10px] uppercase font-bold ${active ? 'text-emerald-700' : 'text-slate-500'}">${day.label.split(' ')[0]}</span><span class="block text-xs font-semibold capitalize mt-0.5">${day.label.substring(day.label.indexOf(' ') + 1)}</span></button>`;
    }).join('');
    const day = days.find(item => item.key === selectedDay);
    if (!day) {
      title.innerText = 'Elegí un día para ver horarios';
      slotList.innerHTML = '<span class="col-span-full text-[11px] text-slate-500">Seleccioná una fecha disponible arriba.</span>';
      return;
    }
    title.innerText = `Horarios para ${day.label}`;
    slotList.innerHTML = slots.map((slot, index) => {
      if (day.unavailable.includes(index)) return `<button type="button" disabled aria-label="${slot}, no disponible" class="py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-400 border border-slate-200 line-through cursor-not-allowed">${slot}</button>`;
      const active = selectedSlot === slot;
      return `<button type="button" onclick="selectAgendaSlot('${slot}')" class="py-2 rounded-lg text-xs font-bold border transition ${active ? 'bg-emerald-600 border-emerald-600 text-white ring-2 ring-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'}">${slot}</button>`;
    }).join('');
  }

  function updateConfirm() {
    const button = document.getElementById('appointment-confirm-button');
    if (!button) return;
    const ready = selectedDay && selectedSlot;
    button.disabled = !ready;
    button.className = ready ? 'px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition' : 'px-4 py-2 bg-slate-200 text-slate-500 rounded-lg text-xs font-bold cursor-not-allowed';
    button.innerText = ready ? `Confirmar ${selectedSlot}` : 'Elegí un horario';
  }

  window.selectAgendaDay = (key) => { selectedDay = key; selectedSlot = null; updateConfirm(); render(); };
  window.selectAgendaSlot = (slot) => { selectedSlot = slot; updateConfirm(); render(); };
  window.confirmAgendaAppointment = () => {
    const nameInput = document.getElementById('appointment-client-name');
    const phoneInput = document.getElementById('appointment-client-phone');
    const status = document.getElementById('appointment-notification-status');
    const day = days.find(item => item.key === selectedDay);
    const name = nameInput?.value.trim();
    const phone = phoneInput?.value.trim();
    if (!day || !selectedSlot || !name || !phone) {
      window.showToast?.('Ingresá el nombre y WhatsApp del cliente para confirmar el turno.');
      return;
    }
    const service = window.currentCompany?.services?.[0]?.name || 'Consulta / Atención';
    const professional = window.currentCompany?.appointmentProfessional || 'Profesional de guardia';
    const table = document.getElementById('citas-table-body');
    if (table) {
      const row = document.createElement('tr');
      row.className = 'bg-emerald-50/60';
      row.innerHTML = `<td class="px-3 py-2.5 font-semibold text-slate-900">${day.label} ${selectedSlot} hs</td><td class="px-3 py-2.5 font-sans font-medium text-slate-900">${escapeHtml(name)}</td><td class="px-3 py-2.5 text-slate-600">${escapeHtml(phone)}</td><td class="px-3 py-2.5 font-sans">${escapeHtml(service)}</td><td class="px-3 py-2.5 text-slate-600">${escapeHtml(professional)}</td><td class="px-3 py-2.5"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">✓ Confirmada</span></td><td class="px-3 py-2.5 text-right font-sans"><span class="text-[10px] text-blue-600 font-semibold">Google Calendar pendiente</span></td>`;
      table.insertBefore(row, table.firstChild);
    }
    day.unavailable.push(slots.indexOf(selectedSlot));
    if (status) {
      status.classList.remove('hidden');
      status.innerHTML = `<strong>Turno confirmado.</strong> El evento para ${escapeHtml(professional)} queda preparado para Google Calendar. Al conectar la cuenta, Calendar notificará al profesional y programará el recordatorio 2 horas antes.`;
    }
    nameInput.value = '';
    phoneInput.value = '';
    selectedSlot = null;
    updateConfirm();
    render();
    window.showToast?.('Turno confirmado: notificaciones programadas.');
  };
  render();
})();
