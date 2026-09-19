package com.example.kambus

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.content.IntentFilter
import android.os.Bundle
import android.os.Build
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.util.Locale

import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.firebase.messaging.FirebaseMessaging


class MainActivity : ComponentActivity(), TextToSpeech.OnInitListener {

    private lateinit var webView: WebView
    private var tts: TextToSpeech? = null
    private val fcmReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val title = org.json.JSONObject.quote(intent?.getStringExtra("title") ?: "KAMBUS update")
            val message = org.json.JSONObject.quote(intent?.getStringExtra("message") ?: "You have a new notification.")
            webView.evaluateJavascript("window.KambusNotify && KambusNotify.notify({type:'info',title:$title,message:$message}); window.KambusNotificationCenter && KambusNotificationCenter.refresh();", null)
        }
    }

    companion object {
        private const val TAG = "KAMBUS_WEBVIEW"
        private const val LOCATION_PERMISSION_REQUEST = 100
    }


    // ========================================
    // NATIVE TEXT-TO-SPEECH BRIDGE FOR JAVASCRIPT
    // ========================================
    // Android WebView does not implement the Web Speech API, so
    // driver.js / voiceAnnouncements.js cannot call speechSynthesis
    // directly. This bridge exposes Android's native TextToSpeech
    // engine to JavaScript as window.AndroidTTS.
    inner class AndroidTTSBridge {
        @JavascriptInterface
        fun speak(text: String) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kambus_tts")
        }

        @JavascriptInterface
        fun isSpeaking(): Boolean {
            return tts?.isSpeaking ?: false
        }

        @JavascriptInterface
        fun stop() {
            tts?.stop()
        }
    }


    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {

        super.onCreate(savedInstanceState)
        ContextCompat.registerReceiver(this, fcmReceiver, IntentFilter(KambusMessagingService.ACTION_FCM_MESSAGE), ContextCompat.RECEIVER_NOT_EXPORTED)


        // ========================================
        // LOCATION & CAMERA PERMISSIONS
        // ========================================

        val permissionsToRequest = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
            permissionsToRequest.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.CAMERA)
        }

        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                LOCATION_PERMISSION_REQUEST
            )
        }


        // ========================================
        // WINDOW CONFIGURATION
        // ========================================

        WindowCompat.setDecorFitsSystemWindows(
            window,
            false
        )

        WindowCompat
            .getInsetsController(
                window,
                window.decorView
            )
            .isAppearanceLightStatusBars = true


        // ========================================
        // LOAD MAIN LAYOUT
        // ========================================

        setContentView(R.layout.activity_main)


        // ========================================
        // FIND WEBVIEW
        // ========================================

        webView =
            findViewById(R.id.webView)


        // ========================================
        // TEXT-TO-SPEECH INITIALIZATION
        // ========================================

        tts = TextToSpeech(this, this)


        // ========================================
        // WEBVIEW DEBUGGING
        // ========================================

        WebView.setWebContentsDebuggingEnabled(true)


        // ========================================
        // SYSTEM BAR INSETS
        // ========================================

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !getSharedPreferences("kambus", MODE_PRIVATE).getBoolean("notification_prompted", false)) {
            getSharedPreferences("kambus", MODE_PRIVATE).edit().putBoolean("notification_prompted", true).apply()
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), LOCATION_PERMISSION_REQUEST + 1)
        }
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            getSharedPreferences("kambus", MODE_PRIVATE).edit().putString("fcm_token", token).apply()
        }


        // ========================================
        // WEBVIEW SETTINGS
        // ========================================

        webView.settings.apply {

            // JavaScript
            javaScriptEnabled = true

            // Allow speech synthesis and media playback without explicit user touch gesture
            mediaPlaybackRequiresUserGesture = false

            // LocalStorage
            domStorageEnabled = true

            // File access
            allowFileAccess = true
            allowContentAccess = true

            // HTTP API access
            mixedContentMode =
                WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

            // Better WebView compatibility
            databaseEnabled = true

            // Allow loading local files
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true

            // Native mobile viewport: do not render local assets as a desktop page.
            useWideViewPort = false
            loadWithOverviewMode = false
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
        }

        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isHorizontalScrollBarEnabled = false
        webView.isVerticalScrollBarEnabled = false
        webView.setBackgroundColor(android.graphics.Color.TRANSPARENT)


        // ========================================
        // JAVASCRIPT INTERFACE (NATIVE TTS BRIDGE)
        // ========================================
        // Must be added BEFORE loadUrl() so it is available to every
        // page loaded in this WebView (driver.html, student.html, etc.)

        webView.addJavascriptInterface(AndroidTTSBridge(), "AndroidTTS")


        // ========================================
        // WEBVIEW CLIENT
        // ========================================

        webView.webViewClient =
            object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {

                    val url = request?.url ?: return false

                    if (url.scheme == "tel") {
                        try {
                            val intent = Intent(
                                Intent.ACTION_DIAL,
                                Uri.parse(url.toString())
                            )

                            startActivity(intent)
                        } catch (e: Exception) {
                            Log.e(
                                TAG,
                                "Unable to open phone dialer: ${e.message}"
                            )
                        }

                        return true
                    }

                    return false
                }

                override fun onPageStarted(
                    view: WebView?,
                    url: String?,
                    favicon: android.graphics.Bitmap?
                ) {

                    Log.d(
                        TAG,
                        "Page started: $url"
                    )

                    super.onPageStarted(
                        view,
                        url,
                        favicon
                    )
                }


                override fun onPageFinished(
                    view: WebView?,
                    url: String?
                ) {

                    Log.d(
                        TAG,
                        "Page finished: $url"
                    )

                    super.onPageFinished(
                        view,
                        url
                    )
                    uploadStoredFcmToken()
                }


                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {

                    Log.e(
                        TAG,
                        "WebView Error: " +
                                "${error?.description}"
                    )

                    Log.e(
                        TAG,
                        "Failed URL: " +
                                "${request?.url}"
                    )

                    super.onReceivedError(
                        view,
                        request,
                        error
                    )
                }
            }


        // ========================================
        // WEB CHROME CLIENT
        // ========================================

        webView.webChromeClient =
            object : WebChromeClient() {


                // --------------------------------
                // JAVASCRIPT CONSOLE
                // --------------------------------

                override fun onConsoleMessage(
                    consoleMessage: ConsoleMessage
                ): Boolean {

                    Log.d(
                        TAG,
                        "JS: " +
                                consoleMessage.message() +
                                " | " +
                                consoleMessage.sourceId() +
                                ":" +
                                consoleMessage.lineNumber()
                    )

                    return true
                }


                // --------------------------------
                // WEBVIEW HARDWARE / CAMERA PERMISSION
                // --------------------------------

                override fun onPermissionRequest(request: PermissionRequest?) {
                    Log.d(TAG, "WebView hardware permission requested: ${request?.resources?.joinToString()}")
                    runOnUiThread {
                        request?.grant(request.resources)
                    }
                }


                // --------------------------------
                // GEOLOCATION PERMISSION
                // --------------------------------

                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?
                ) {

                    Log.d(
                        TAG,
                        "Geolocation permission requested: $origin"
                    )

                    callback?.invoke(
                        origin,
                        true,
                        false
                    )
                }
            }


        // ========================================
        // LOAD FRONTEND
        // ========================================

        Log.d(
            TAG,
            "Loading KAMBUS frontend..."
        )

        webView.loadUrl(
            "file:///android_asset/index.html"
        )


        // ========================================
        // BACK BUTTON
        // ========================================

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {

                override fun handleOnBackPressed() {
                    if (!::webView.isInitialized) {
                        finish()
                        return
                    }

                    // Close an open in-page modal first. Do not ever traverse
                    // WebView history: role dashboards are app roots, not browser pages.
                    webView.evaluateJavascript(
                        """
                        (function () {
                          var ids = ['waitModal', 'notTravellingModal', 'passModal'];
                          for (var i = 0; i < ids.length; i++) {
                            var element = document.getElementById(ids[i]);
                            if (element && !element.classList.contains('hidden')) {
                              element.classList.add('hidden');
                              return 'closed';
                            }
                          }
                          return 'root';
                        })();
                        """.trimIndent()
                    ) { result ->
                        if (result != "\"closed\"") {
                            finish()
                        }
                    }
                }
            }
        )
    }

    // ========================================
    // TEXT-TO-SPEECH INIT CALLBACK
    // ========================================

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            Log.d(TAG, "TextToSpeech initialized successfully")
        } else {
            Log.e(TAG, "TextToSpeech initialization failed with status: $status")
        }
    }

    private fun uploadStoredFcmToken() {
        val token = getSharedPreferences("kambus", MODE_PRIVATE).getString("fcm_token", null) ?: return
        val encoded = org.json.JSONObject.quote(token)
        webView.evaluateJavascript("""
            (function () {
              var jwt = localStorage.getItem('kambus_token');
              if (!jwt) return;
              fetch('http://10.170.244.250:8000/notifications/device-token', {
                method: 'POST', headers: {'Content-Type':'application/json','Authorization':'Bearer ' + jwt},
                body: JSON.stringify({token: $encoded, platform: 'android'})
              }).catch(function (error) { console.warn('FCM registration deferred', error); });
            })();
        """.trimIndent(), null)
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        unregisterReceiver(fcmReceiver)
        super.onDestroy()
    }
}