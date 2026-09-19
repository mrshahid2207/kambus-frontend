// ========================================
// KAMBUS - Shared App Configuration
// ========================================

console.log("🚀 KAMBUS Frontend App Initialized.");


// ========================================
// BACKEND CONFIGURATION
// ========================================

const API_BASE_URL = "https://kambus-backend.onrender.com";
console.log("🔗 Backend:", API_BASE_URL);


// ========================================
// API HELPER
// ========================================

async function apiRequest(endpoint, options = {}) {

    try {

        const response = await fetch(
            `${API_BASE_URL}${endpoint}`,
            {
                ...options,

                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                }
            }
        );


        const text = await response.text();

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }


        if (!response.ok) {

            throw new Error(
                data?.detail ||
                `API request failed (${response.status})`
            );
        }


        return data;

    } catch (error) {

        console.error(
            `❌ API Error [${endpoint}]:`,
            error
        );

        throw error;
    }
}


// ========================================
// GET JWT TOKEN
// ========================================

function getToken() {

    return localStorage.getItem(
        "kambus_token"
    );
}


// ========================================
// SAVE JWT TOKEN
// ========================================

function saveToken(token) {

    localStorage.setItem(
        "kambus_token",
        token
    );
}


// ========================================
// REMOVE JWT TOKEN
// ========================================

function clearToken() {

    localStorage.removeItem(
        "kambus_token"
    );
}


// ========================================
// AUTHENTICATED API REQUEST
// ========================================

async function authenticatedRequest(
    endpoint,
    options = {}
) {

    const token = getToken();


    if (!token) {

        throw new Error(
            "User is not authenticated"
        );
    }


    return apiRequest(
        endpoint,
        {

            ...options,

            headers: {

                ...(options.headers || {}),

                "Authorization":
                    `Bearer ${token}`
            }
        }
    );
}


// ========================================
// BACKEND CONNECTION TEST
// ========================================

async function testBackend() {

    try {

        const data =
            await apiRequest("/health");


        console.log(
            "✅ Backend Connected:",
            data
        );


        return true;

    } catch (error) {

        console.error(
            "❌ Backend Connection Failed"
        );


        return false;
    }
}


// ========================================
// GET BUS LOCATION
// ========================================

async function getBusLocation(
    busId = 4
) {

    try {

        const data =
            await authenticatedRequest(
                `/buses/${busId}/location`
            );


        console.log(
            "📍 Bus Location:",
            data
        );


        return data;

    } catch (error) {

        console.error(
            "❌ Failed to get bus location:",
            error
        );


        return null;
    }
}


// ========================================
// START LIVE BUS LOCATION
// ========================================

function startBusTracking(
    busId = 4,
    interval = 5000
) {

    console.log(
        `🚌 Starting tracking for Bus ${busId}`
    );


    // Get immediately
    getBusLocation(busId);


    // Then every 5 seconds
    setInterval(
        () => {

            getBusLocation(busId);

        },
        interval
    );
}


// ========================================
// INITIALIZE
// ========================================

testBackend();