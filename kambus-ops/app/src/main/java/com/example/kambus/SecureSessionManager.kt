package com.example.kambus

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

class SecureSessionManager(
    private val context: Context,
    prefsOverride: SharedPreferences? = null
) {

    companion object {
        private const val TAG = "KAMBUS_SESSION"
        const val PREFS_FILE = "kambus_secure_session_prefs"
        const val KEY_JWT_TOKEN = "jwt_token"
        const val KEY_ROLE = "role"
        const val KEY_USER_ID = "user_id"
        const val KEY_CAMPUS_ID = "campus_id"
        const val KEY_METADATA_JSON = "metadata_json"
        const val KEY_DEVICE_ID = "kambus_device_id"

        /**
         * Checks if a JWT string is expired by decoding the payload exp claim.
         * Returns true if expired or malformed, false if valid.
         */
        fun isJwtExpired(token: String): Boolean {
            return try {
                val parts = token.trim().split(".")
                if (parts.size != 3) return true

                val payloadBase64 = parts[1]
                val payloadBytes = decodeBase64Url(payloadBase64)
                val json = JSONObject(String(payloadBytes, Charsets.UTF_8))
                if (!json.has("exp")) return false

                val exp = json.optLong("exp", 0L)
                val nowSeconds = System.currentTimeMillis() / 1000
                exp in 1..nowSeconds
            } catch (e: Exception) {
                Log.w(TAG, "Failed to parse JWT exp: ${e.message}")
                true
            }
        }

        private fun decodeBase64Url(str: String): ByteArray {
            return try {
                java.util.Base64.getUrlDecoder().decode(str)
            } catch (_: Throwable) {
                android.util.Base64.decode(
                    str,
                    android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP
                )
            }
        }
    }

    private val prefs: SharedPreferences = prefsOverride ?: createEncryptedSharedPreferences(context)

    private fun createEncryptedSharedPreferences(ctx: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(ctx)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                ctx,
                PREFS_FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e(TAG, "EncryptedSharedPreferences init failed; attempting reset of corrupted file", e)
            try {
                ctx.deleteSharedPreferences(PREFS_FILE)
                val masterKey = MasterKey.Builder(ctx)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()

                EncryptedSharedPreferences.create(
                    ctx,
                    PREFS_FILE,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } catch (fallbackError: Exception) {
                Log.e(TAG, "Critical failure initializing secure storage, fallback to private mode", fallbackError)
                ctx.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
            }
        }
    }

    /**
     * Persists authentication token and user role to encrypted storage.
     */
    fun saveSession(
        token: String,
        role: String,
        userId: String = "",
        metadataJson: String? = null,
        campusId: String? = null
    ) {
        val editor = prefs.edit()
            .putString(KEY_JWT_TOKEN, token)
            .putString(KEY_ROLE, role)
            .putString(KEY_USER_ID, userId)

        if (metadataJson != null) {
            editor.putString(KEY_METADATA_JSON, metadataJson)
        } else {
            editor.remove(KEY_METADATA_JSON)
        }

        if (campusId != null) {
            editor.putString(KEY_CAMPUS_ID, campusId)
        }

        editor.apply()
    }

    /**
     * Completely wipes stored session from encrypted storage.
     * Preserves device ID so the device identity remains stable across logins.
     */
    fun clearSession() {
        val deviceId = prefs.getString(KEY_DEVICE_ID, null)
        val editor = prefs.edit().clear()
        if (!deviceId.isNullOrBlank()) {
            editor.putString(KEY_DEVICE_ID, deviceId)
        }
        editor.apply()
    }

    /**
     * Retrieves or generates a persistent device ID.
     */
    fun getDeviceId(): String {
        var deviceId = prefs.getString(KEY_DEVICE_ID, null)
        if (deviceId.isNullOrBlank()) {
            deviceId = java.util.UUID.randomUUID().toString()
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        }
        return deviceId
    }

    fun getToken(): String? = prefs.getString(KEY_JWT_TOKEN, null)

    fun getRole(): String? = prefs.getString(KEY_ROLE, null)

    fun getUserId(): String? = prefs.getString(KEY_USER_ID, null)

    fun getCampusId(): String? = prefs.getString(KEY_CAMPUS_ID, null)

    fun getMetadataJson(): String? = prefs.getString(KEY_METADATA_JSON, null)

    /**
     * Verifies whether the stored token is present and unexpired.
     * Automatically purges expired sessions.
     */
    fun isSessionValid(): Boolean {
        val token = getToken()
        val role = getRole()
        if (token.isNullOrBlank() || role.isNullOrBlank()) {
            return false
        }
        if (isJwtExpired(token)) {
            Log.i(TAG, "Persisted JWT is expired. Purging session.")
            clearSession()
            return false
        }
        return true
    }

    /**
     * Returns a JSON object string of the active session for bridge synchronization.
     */
    fun getSessionJson(): String {
        if (!isSessionValid()) return "{}"
        val obj = JSONObject()
        obj.put("token", getToken())
        obj.put("role", getRole())
        obj.put("user_id", getUserId())
        obj.put("campus_id", getCampusId())
        val meta = getMetadataJson()
        if (!meta.isNullOrBlank()) {
            try {
                obj.put("metadata", JSONObject(meta))
            } catch (_: Exception) {
                obj.put("metadata", meta)
            }
        }
        return obj.toString()
    }
}
