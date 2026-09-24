package com.example.kambus

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
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
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import com.google.firebase.messaging.FirebaseMessaging
import java.util.Locale

class MainActivity : ComponentActivity(), TextToSpeech.OnInitListener {

    private lateinit var webView: WebView
    private var tts: TextToSpeech? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var pendingGeoOrigin: String? = null
    private var pendingCameraRequest: PermissionRequest? = null

    private val fcmReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val title = org.json.JSONObject.quote(intent?.getStringExtra("title") ?: "KAMBUS update")
            val message = org.json.JSONObject.quote(intent?.getStringExtra("message") ?: "You have a new notification.")
            webView.evaluateJavascript(
                "window.KambusNotify && KambusNotify.notify({type:'info',title:$title,message:$message}); window.KambusNotificationCenter && KambusNotificationCenter.refresh();",
                null
            )
        }
    }

    companion object {
        private const val TAG = "KAMBUS_WEBVIEW"
        private const val LOCATION_PERMISSION_REQUEST = 100
        private const val CAMERA_PERMISSION_REQUEST = 101
        private const val NOTIFICATION_PERMISSION_REQUEST = 102
    }

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

        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread {
                promptNotificationPermissionIfNeeded()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        ContextCompat.registerReceiver(
            this,
            fcmReceiver,
            IntentFilter(KambusMessagingService.ACTION_FCM_MESSAGE),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )

        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        tts = TextToSpeech(this, this)

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            getSharedPreferences("kambus", MODE_PRIVATE).edit().putString("fcm_token", token).apply()
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            mediaPlaybackRequiresUserGesture = false
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
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

        webView.addJavascriptInterface(AndroidTTSBridge(), "AndroidTTS")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url ?: return false

                if (url.scheme == "tel") {
                    try {
                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse(url.toString()))
                        startActivity(intent)
                    } catch (e: Exception) {
                        if (BuildConfig.DEBUG) {
                            Log.e(TAG, "Unable to open phone dialer: ${e.message}")
                        }
                    }
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                uploadStoredFcmToken()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (BuildConfig.DEBUG) {
                    Log.e(TAG, "WebView Error: ${error?.description} on URL: ${request?.url}")
                }
                super.onReceivedError(view, request, error)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "JS: ${consoleMessage.message()} | ${consoleMessage.sourceId()}:${consoleMessage.lineNumber()}")
                }
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                val req = request ?: return
                val resources = req.resources ?: return
                val hasVideo = resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)

                if (!hasVideo) {
                    runOnUiThread { req.grant(resources) }
                    return
                }

                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    runOnUiThread { req.grant(resources) }
                    return
                }

                pendingCameraRequest = req
                runOnUiThread {
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("Camera Access")
                        .setMessage("Camera access is needed to scan student bus passes.")
                        .setPositiveButton("Allow") { _, _ ->
                            ActivityCompat.requestPermissions(
                                this@MainActivity,
                                arrayOf(Manifest.permission.CAMERA),
                                CAMERA_PERMISSION_REQUEST
                            )
                        }
                        .setNegativeButton("Not Now") { _, _ ->
                            pendingCameraRequest?.deny()
                            pendingCameraRequest = null
                        }
                        .setOnCancelListener {
                            pendingCameraRequest?.deny()
                            pendingCameraRequest = null
                        }
                        .show()
                }
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback?.invoke(origin, true, false)
                    return
                }

                pendingGeoOrigin = origin
                pendingGeoCallback = callback

                AlertDialog.Builder(this@MainActivity)
                    .setTitle("Location Access")
                    .setMessage("Location access is needed to show your current stop and track campus buses in real time.")
                    .setPositiveButton("Allow") { _, _ ->
                        ActivityCompat.requestPermissions(
                            this@MainActivity,
                            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                            LOCATION_PERMISSION_REQUEST
                        )
                    }
                    .setNegativeButton("Not Now") { _, _ ->
                        pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                        pendingGeoCallback = null
                        pendingGeoOrigin = null
                    }
                    .setOnCancelListener {
                        pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                        pendingGeoCallback = null
                        pendingGeoOrigin = null
                    }
                    .show()
            }
        }

        webView.loadUrl("file:///android_asset/index.html")

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (!::webView.isInitialized) {
                        finish()
                        return
                    }

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

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            LOCATION_PERMISSION_REQUEST -> {
                val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
                pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
                pendingGeoCallback = null
                pendingGeoOrigin = null
            }
            CAMERA_PERMISSION_REQUEST -> {
                val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    pendingCameraRequest?.grant(pendingCameraRequest?.resources)
                } else {
                    pendingCameraRequest?.deny()
                }
                pendingCameraRequest = null
            }
            NOTIFICATION_PERMISSION_REQUEST -> {
                // System notification setting updated
            }
        }
    }

    private fun promptNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            val prefs = getSharedPreferences("kambus", MODE_PRIVATE)
            if (!prefs.getBoolean("notification_prompted", false)) {
                prefs.edit().putBoolean("notification_prompted", true).apply()
                AlertDialog.Builder(this)
                    .setTitle("Notifications")
                    .setMessage("Enable notifications to receive real-time bus arrival alerts and announcements.")
                    .setPositiveButton("Allow") { _, _ ->
                        ActivityCompat.requestPermissions(
                            this,
                            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                            NOTIFICATION_PERMISSION_REQUEST
                        )
                    }
                    .setNegativeButton("Not Now", null)
                    .show()
            }
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
        }
    }

    private fun uploadStoredFcmToken() {
        promptNotificationPermissionIfNeeded()
        val token = getSharedPreferences("kambus", MODE_PRIVATE).getString("fcm_token", null) ?: return
        val encoded = org.json.JSONObject.quote(token)
        webView.evaluateJavascript(
            """
            (function () {
              var jwt = localStorage.getItem('kambus_token');
              if (!jwt) return;
                fetch('https://kambus-backend.onrender.com/notifications/device-token', {
                method: 'POST', headers: {'Content-Type':'application/json','Authorization':'Bearer ' + jwt},
                body: JSON.stringify({token: $encoded, platform: 'android'})
              }).catch(function (error) {});
            })();
            """.trimIndent(),
            null
        )
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        unregisterReceiver(fcmReceiver)
        super.onDestroy()
    }
}