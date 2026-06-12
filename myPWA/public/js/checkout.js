(function () {
  function getLastBooking() { 
    try {
      return JSON.parse(sessionStorage.getItem('lastBooking')) || null; 
    } catch { return null; } 
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  async function loadEventTitle(eventId) {
    if (!eventId) return '';
    try {
      const resp = await fetch(`/events/${encodeURIComponent(eventId)}`);
      if (!resp.ok) return '';
      const data = await resp.json();
      return data.event?.title || '';
    } catch { return ''; }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const booking = getLastBooking();
    const eventInfoEl = document.getElementById('eventInfo');
    const seatsEl = document.getElementById('bookedSeats');

    if (!booking) {
      eventInfoEl.textContent = 'No recent booking found.';
      return;
    }

    const title = await loadEventTitle(booking.eventId);
    eventInfoEl.textContent = title ? `Event: ${title}` : `Event ID: ${booking.eventId}`;

    seatsEl.innerHTML = '';
    (booking.seats || []).forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      seatsEl.appendChild(li);
    });

    // Clear lastBooking so refresh doesn't duplicate
    sessionStorage.removeItem('lastBooking');
  });
})();
