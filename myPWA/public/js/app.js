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
            renderSeatMap();
        }
    } catch (error) {
        console.error('Could not load event details:', error);
        const summary = document.getElementById('eventSummary');
        if (summary) {
            summary.innerHTML = `<p class="error">${error.message}</p>`;
        }
    }
}

const seatRows = ['A', 'B', 'C', 'D'];
const seatsPerRow = 15;
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
    const row = button.dataset.row;
    const seat = Number(button.dataset.seat);
    if (!row || !seat) return;

    const index = selectedSeats.findIndex(item => item.row === row && item.seat === seat);
    if (index >= 0) { // If the seat is already selected, remove it from the selection and update the button style
        selectedSeats.splice(index, 1);
        button.classList.remove('selected');
    } else { // If the seat is not selected, add it to the selection and update the button style
        selectedSeats.push({ row, seat });
        button.classList.add('selected');
    }
    updateBookingList();
}

function renderSeatMap() { // Render the seat map based on defined rows and seats per row, and attach click handlers for seat selection
    const seatGrid = document.getElementById('seatGrid');
    if (!seatGrid) return;

    seatGrid.innerHTML = '';  
    seatRows.forEach(row => {  //
        const rowContainer = document.createElement('div'); // Create a container for each row of seats
        rowContainer.className = 'seat-row';

        const rowLabel = document.createElement('div'); // Create a label for the row (e.g., "Row A") and add it to the row container
        rowLabel.className = 'row-label';
        rowLabel.textContent = row;
        rowContainer.appendChild(rowLabel);

        for (let seat = 1; seat <= seatsPerRow; seat += 1) { // Create a button for each seat and attach click handler to toggle selection
            const seatButton = document.createElement('button');
            seatButton.type = 'button';
            seatButton.className = 'seat available';
            seatButton.dataset.row = row;
            seatButton.dataset.seat = String(seat);
            seatButton.textContent = seat;
            seatButton.addEventListener('click', handleSeatClick);
            rowContainer.appendChild(seatButton);
        }

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
}

window.addEventListener('DOMContentLoaded', () => {
    attachFormHandlers();
    loadEventDetails();
    renderSeatMap();
});
