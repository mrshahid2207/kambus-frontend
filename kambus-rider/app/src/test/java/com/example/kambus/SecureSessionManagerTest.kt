package com.example.kambus

import android.content.SharedPreferences
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.nio.charset.StandardCharsets
import java.util.Base64

class SecureSessionManagerTest {

    private lateinit var fakePrefs: FakeSharedPreferences
    private lateinit var sessionManager: SecureSessionManager

    @Before
    fun setUp() {
        fakePrefs = FakeSharedPreferences()
        // Pass dummy context and fakePrefs override
        sessionManager = SecureSessionManager(
            context = object : android.content.ContextWrapper(null) {},
            prefsOverride = fakePrefs
        )
    }

    private fun createDummyJwt(expEpochSeconds: Long, role: String = "student"): String {
        val header = Base64.getUrlEncoder().withoutPadding().encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray(StandardCharsets.UTF_8))
        val payload = Base64.getUrlEncoder().withoutPadding().encodeToString("""{"sub":"123","role":"$role","exp":$expEpochSeconds}""".toByteArray(StandardCharsets.UTF_8))
        val signature = "dummy_signature"
        return "$header.$payload.$signature"
    }

    @Test
    fun testIsJwtExpired_withFutureExpiration() {
        val futureExp = (System.currentTimeMillis() / 1000) + 3600
        val token = createDummyJwt(futureExp)
        assertFalse(SecureSessionManager.isJwtExpired(token))
    }

    @Test
    fun testIsJwtExpired_withPastExpiration() {
        val pastExp = (System.currentTimeMillis() / 1000) - 3600
        val token = createDummyJwt(pastExp)
        assertTrue(SecureSessionManager.isJwtExpired(token))
    }

    @Test
    fun testIsJwtExpired_withMalformedToken() {
        assertTrue(SecureSessionManager.isJwtExpired("not-a-valid-jwt"))
        assertTrue(SecureSessionManager.isJwtExpired(""))
    }

    @Test
    fun testSaveAndRetrieveSession() {
        val futureExp = (System.currentTimeMillis() / 1000) + 7200
        val token = createDummyJwt(futureExp, "student")
        val metadata = """{"student":{"name":"John Doe","roll_number":"12345"}}"""

        sessionManager.saveSession(
            token = token,
            role = "student",
            userId = "42",
            metadataJson = metadata,
            campusId = "1"
        )

        assertTrue(sessionManager.isSessionValid())
        assertEquals(token, sessionManager.getToken())
        assertEquals("student", sessionManager.getRole())
        assertEquals("42", sessionManager.getUserId())
        assertEquals("1", sessionManager.getCampusId())

        val sessionJson = sessionManager.getSessionJson()
        val json = JSONObject(sessionJson)
        assertEquals(token, json.getString("token"))
        assertEquals("student", json.getString("role"))
        assertEquals("42", json.getString("user_id"))
        assertEquals("1", json.getString("campus_id"))
    }

    @Test
    fun testExpiredSession_autoPurgesOnValidation() {
        val pastExp = (System.currentTimeMillis() / 1000) - 100
        val token = createDummyJwt(pastExp, "student")

        sessionManager.saveSession(token, "student", "10")
        assertFalse(sessionManager.isSessionValid())
        assertNull(sessionManager.getToken())
        assertNull(sessionManager.getRole())
    }

    @Test
    fun testClearSession_wipesAllData() {
        val futureExp = (System.currentTimeMillis() / 1000) + 3600
        val token = createDummyJwt(futureExp, "parent")

        sessionManager.saveSession(token, "parent", "55")
        assertTrue(sessionManager.isSessionValid())

        sessionManager.clearSession()
        assertFalse(sessionManager.isSessionValid())
        assertNull(sessionManager.getToken())
        assertNull(sessionManager.getRole())
        assertEquals("{}", sessionManager.getSessionJson())
    }

    /**
     * Minimal in-memory FakeSharedPreferences for JVM unit testing.
     */
    class FakeSharedPreferences : SharedPreferences {
        val map = mutableMapOf<String, Any?>()

        override fun getAll(): MutableMap<String, *> = map
        override fun getString(key: String?, defValue: String?): String? = map[key] as? String ?: defValue
        override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? = null
        override fun getInt(key: String?, defValue: Int): Int = map[key] as? Int ?: defValue
        override fun getLong(key: String?, defValue: Long): Long = map[key] as? Long ?: defValue
        override fun getFloat(key: String?, defValue: Float): Float = map[key] as? Float ?: defValue
        override fun getBoolean(key: String?, defValue: Boolean): Boolean = map[key] as? Boolean ?: defValue
        override fun contains(key: String?): Boolean = map.containsKey(key)
        override fun edit(): SharedPreferences.Editor = FakeEditor(this)
        override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}
        override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}

        class FakeEditor(private val prefs: FakeSharedPreferences) : SharedPreferences.Editor {
            private val pending = mutableMapOf<String, Any?>()
            private var clearFlag = false

            override fun putString(key: String?, value: String?): SharedPreferences.Editor {
                if (key != null) pending[key] = value
                return this
            }
            override fun putStringSet(key: String?, values: MutableSet<String>?): SharedPreferences.Editor = this
            override fun putInt(key: String?, value: Int): SharedPreferences.Editor {
                if (key != null) pending[key] = value
                return this
            }
            override fun putLong(key: String?, value: Long): SharedPreferences.Editor {
                if (key != null) pending[key] = value
                return this
            }
            override fun putFloat(key: String?, value: Float): SharedPreferences.Editor {
                if (key != null) pending[key] = value
                return this
            }
            override fun putBoolean(key: String?, value: Boolean): SharedPreferences.Editor {
                if (key != null) pending[key] = value
                return this
            }
            override fun remove(key: String?): SharedPreferences.Editor {
                if (key != null) pending[key] = null
                return this
            }
            override fun clear(): SharedPreferences.Editor {
                clearFlag = true
                return this
            }
            override fun commit(): Boolean {
                apply()
                return true
            }
            override fun apply() {
                if (clearFlag) {
                    prefs.map.clear()
                    clearFlag = false
                }
                for ((k, v) in pending) {
                    if (v == null) prefs.map.remove(k) else prefs.map[k] = v
                }
                pending.clear()
            }
        }
    }
}
