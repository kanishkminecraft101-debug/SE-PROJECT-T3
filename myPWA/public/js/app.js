const authTokenKey = 'stagepassJwtToken';
const authUserKey = 'stagepassUser';

function getMessageContainer(id) { // Helper to get message container elements
    return document.getElementById(id); 
}

function getStoredToken() { // Retrieve stored JWT token from localStorage
    return localStorage.getItem(authTokenKey);
}

function getStoredUser() { // Retrieve stored user information from localStorage
    const raw = localStorage.getItem(authUserKey);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function setAuth(token, user) { // Store JWT token and user information in localStorage
    if (token) {
        localStorage.setItem(authTokenKey, token);
    }
    if (user) {
        localStorage.setItem(authUserKey, JSON.stringify(user));
    }
}

function clearAuth() { // Clear authentication data from localStorage
    localStorage.removeItem(authTokenKey);
    localStorage.removeItem(authUserKey);
}

function authHeaders() { // Helper to get authorization headers for authenticated requests
    const token = getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function showMessage(message, type = 'error') { // type can be 'error' or 'success'
    const errorEl = getMessageContainer('errorMessage');
    const successEl = getMessageContainer('successMessage');

    if (errorEl) { // Show error message if type is 'error'
        errorEl.textContent = type === 'error' ? message : '';
        errorEl.style.display = type === 'error' && message ? 'block' : 'none';
    }

    if (successEl) { // Show success message if type is 'success'
        successEl.textContent = type === 'success' ? message : '';
        successEl.style.display = type === 'success' && message ? 'block' : 'none';
    }
}

function clearMessages() {
    showMessage('', 'error');
    showMessage('', 'success');
}

function validateLoginFields({ username, password }) { // Validate login form fields
    if (!username || !password) {
        return 'Please enter both username and password.';
    }
    return null;
}

function validateSignupFields({ username, password, confirmPassword }) { // Validate signup form fields
    if (!username || !password || !confirmPassword) {
        return 'Please complete every field.';
    }
    if (password !== confirmPassword) {
        return 'Passwords do not match.';
    }
    if (password.length < 6) {
        return 'Password must be at least 6 characters.';
    }
    return null;
}

async function postJson(url, data) { // Helper function to send POST requests with JSON body
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({})); // Attempt to parse JSON response, fallback to empty object on failure
    return { ok: response.ok, status: response.status, payload };
}

async function handleLogin(event) { // Handle login form submission
    event.preventDefault();
    clearMessages();

    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value;
    const error = validateLoginFields({ username, password }); // Validate login fields
    if (error) {
        showMessage(error, 'error');
        return;
    }

    const { ok, payload } = await postJson('/login', { username, password }); // Send login request to server
    if (!ok) {
        showMessage(payload.message || 'Login failed. Please try again.', 'error');
        return;
    }

    if (payload.token && payload.user) { // Store token and user info on successful login
        setAuth(payload.token, payload.user);
    }

    if (payload.user?.role === 'admin') { // Redirect admin users to admin page
        window.location.href = 'admin.html';
        return;
    }

    window.location.href = 'index.html';
}

async function handleSignup(event) { // Handle signup form submission
    event.preventDefault();
    clearMessages();

    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    const error = validateSignupFields({ username, password, confirmPassword });
    if (error) {
        showMessage(error, 'error');
        return;
    }

    const { ok, payload } = await postJson('/signup', { username, password }); // Send signup request to server
    if (!ok) {
        showMessage(payload.message || 'Sign up failed. Please try again.', 'error');
        return;
    }

    showMessage('Account created. Redirecting to login...', 'success'); // Show success message on successful signup
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 1200);
}

async function loadEvents() { // Load events from server and display them
    try {
        const response = await fetch('/events');
        const data = await response.json();
        const events = data.events || [];
        
        const container = document.getElementById('eventsContainer'); // Get the container element for displaying events
        if (!container) return; 
        
        if (events.length === 0) {
            container.innerHTML = '<div class="no-events">No events available</div>';
            return;
        }
        
        // Render event cards with basic info and a button to view details
        container.innerHTML = events.map(event => `
            <div class="event-card">
                <div class="event-info">
                    <h3>${event.title || 'Untitled Event'}</h3>
                    <p class="event-location"><strong>Location:</strong> ${event.location || 'TBA'}</p> 
                    <p class="event-date"><strong>Date:</strong> ${event.date || 'TBA'}</p>
                </div>
                <button class="find-tickets-btn" onclick="viewEvent(${event.id})">Find Tickets</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load events:', error); // Log error to console for debugging
        const container = document.getElementById('eventsContainer');
        if (container) {
            container.innerHTML = '<div class="error">Failed to load events</div>';
        }
    }
}

function viewEvent(eventId) { // Navigate to event detail page for selected event
    window.location.href = `eventinfo.html?id=${eventId}`;
}

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

async function loadEventDetails() { // Load details for a specific event based on query parameter
    const eventId = getQueryParam('id');
    if (!eventId) {
        const summary = document.getElementById('eventSummary');
        if (summary) {
            summary.innerHTML = '<p class="error">No event selected. Go back and choose an event.</p>';
        }
        return;
    }

    try {
        const response = await fetch(`/events/${encodeURIComponent(eventId)}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to load event details.');
        }

        const data = await response.json();
        const event = data.event;
        if (!event) {
            throw new Error('Event data is missing from the server response.');
        }

        document.getElementById('eventDate').textContent = event.date ? `Date: ${event.date}${event.time ? ` · ${event.time}` : ''}` : '';
        document.getElementById('eventLocation').textContent = event.location ? `Location: ${event.location}` : '';
        document.getElementById('eventTitleSeating').textContent = event.title ? `${event.title} Seating` : 'Event Seating';

        const seatMap = document.getElementById('seatMap');
        if (seatMap) {
            seatMap.innerHTML = '<div class="seat-map-header"><span>Screen</span></div><div class="seat-grid" id="seatGrid"></div><div class="seat-legend"><span class="seat available"></span> Available <span class="seat selected"></span> Selected</div>';
            fetchSeatsForEvent(eventId);
        }
        
    } catch (error) {
        console.error('Could not load event details:', error);
        const summary = document.getElementById('eventSummary');
        if (summary) {
            summary.innerHTML = `<p class="error">${error.message}</p>`;
        }
    }
}

let seatsFromApi = []; // seats loaded from server for current event
let selectedSeats = [];

function formatSeatLabel(row, seatNumber) { //  Helper function to format seat labels, e.g., "A5" for Row A Seat 5
    return `${row}${seatNumber}`;
}

function updateBookingList() { // Update the list of selected seats and the ticket count display
    const selectedList = document.getElementById('selectedSeats');
    const ticketCount = document.getElementById('ticketCount');
    const checkoutBtn = document.getElementById('checkoutBtn');

    if (!selectedList || !ticketCount || !checkoutBtn) return;

    selectedList.innerHTML = '';
    if (selectedSeats.length === 0) { // Show placeholder text when no seats are selected
        selectedList.innerHTML = '<li class="empty">No seats selected</li>';
        checkoutBtn.disabled = true;
    } else {
        selectedSeats.forEach(({ row, seat }) => { // Create list items for each selected seat and enable the checkout button
            const li = document.createElement('li');
            li.textContent = `Row ${row}, Seat ${seat}`;
            selectedList.appendChild(li);
        });
        checkoutBtn.disabled = false; 
    }

    ticketCount.textContent = selectedSeats.length;
}

function handleSeatClick(event) { // Handle click events on seat buttons to toggle selection and update the booking list accordingly
    const button = event.currentTarget;
    const seatId = button.dataset.seatid;
    const row = button.dataset.row;
    const seat = Number(button.dataset.seat);
    if (!seatId) return;

    const index = selectedSeats.findIndex(item => item.seatId === seatId);
    if (index >= 0) {
        selectedSeats.splice(index, 1);
        button.classList.remove('selected');
    } else {
        selectedSeats.push({ seatId, row, seat });
        button.classList.add('selected');
    }
    updateBookingList();
}

async function fetchSeatsForEvent(eventId) { // Fetch seat information for the specified event from the server and render the seat map
    try {
        const resp = await fetch(`/seats?event_id=${encodeURIComponent(eventId)}`);
        if (!resp.ok) throw new Error('Failed to load seats');
        const data = await resp.json();
        seatsFromApi = data.seats || [];
        renderSeatMapFromApi();
    } catch (err) {
        console.error(err);
        const seatMap = document.getElementById('seatMap');
        if (seatMap) seatMap.innerHTML = '<div class="error">Could not load seats.</div>';
    }
}

function renderSeatMapFromApi() { // Render the seat map based on the seat data retrieved from the server, grouping seats by row and creating buttons for each seat with appropriate classes and event listeners
    const seatGrid = document.getElementById('seatGrid');
    if (!seatGrid) return;
    seatGrid.innerHTML = '';

    // Group seats by row
    const rows = {};
    seatsFromApi.forEach(s => {
        const label = s.label || String(s.row || 'A') + String(s.col || '1');
        const rowChar = label.replace(/\d+/g, '') || 'A';
        const seatNum = label.replace(/[^0-9]/g, '') || '1';
        if (!rows[rowChar]) rows[rowChar] = [];
        rows[rowChar].push({ ...s, rowChar, seatNum });
    });

    Object.keys(rows).sort().forEach(row => { // Sort rows alphabetically and render each row with its seats
        const rowContainer = document.createElement('div');
        rowContainer.className = 'seat-row';

        const rowLabel = document.createElement('div');
        rowLabel.className = 'row-label';
        rowLabel.textContent = row;
        rowContainer.appendChild(rowLabel);

        rows[row].sort((a,b)=> Number(a.seatNum) - Number(b.seatNum)).forEach(s => { // Sort seats within the row numerically and create buttons for each seat with appropriate classes based on availability, and attach click event listeners for available seats
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'seat';
            btn.dataset.seatid = String(s.id);
            btn.dataset.row = s.rowChar;
            btn.dataset.seat = String(s.seatNum);
            btn.textContent = s.seatNum;
            if (s.status === 'booked') {
                btn.classList.add('booked');
                btn.disabled = true;
            } else {
                btn.classList.add('available');
                btn.addEventListener('click', handleSeatClick);
            }
            rowContainer.appendChild(btn);
        });

        seatGrid.appendChild(rowContainer);
    });

    updateBookingList();
}

function attachFormHandlers() {
    const loginForm = document.getElementById('loginForm'); // Attach event listener to login form if it exists
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const signupForm = document.getElementById('signupForm'); // Attach event listener to signup form if it exists
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }

    // Back to events button (used on eventinfo and other pages)
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'index.html';
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    attachFormHandlers();
    loadEventDetails();
    // seat map rendering is handled after event details load
});

// Checkout flow: when checkout button clicked, POST /book and redirect to checkout page
document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'checkoutBtn') {
        const eventId = getQueryParam('id');
        if (!eventId) return showMessage('No event selected', 'error');
        if (selectedSeats.length === 0) return showMessage('No seats selected', 'error');

        const seatIds = selectedSeats.map(s => Number(s.seatId));
        try {
            const token = getStoredToken();
            const resp = await fetch('/book', {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
                body: JSON.stringify({ seats: seatIds, event_id: Number(eventId) })
            });
            const data = await resp.json().catch(()=>({}));
            if (!resp.ok) {
                if (resp.status === 401) {
                    // Not authenticated — redirect to login
                    localStorage.setItem('pendingBooking', JSON.stringify({ eventId, seatIds }));
                    window.location.href = 'login.html';
                    return;
                }
                return showMessage(data.message || 'Booking failed', 'error');
            }

            // Store last booking temporarily and redirect to confirmation
            const bookedLabels = selectedSeats.map(s => `Row ${s.row}, Seat ${s.seat}`);
            sessionStorage.setItem('lastBooking', JSON.stringify({ eventId, seats: bookedLabels }));
            window.location.href = 'checkout.html';
        } catch (err) {
            console.error(err);
            showMessage('Booking failed', 'error');
        }
    }
});
