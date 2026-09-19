package com.example.kambus

import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class KambusMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        getSharedPreferences("kambus", MODE_PRIVATE).edit().putString("fcm_token", token).apply()
    }
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.notification?.title ?: message.data["title"] ?: "KAMBUS update"
        val body = message.notification?.body ?: message.data["message"] ?: "You have a new notification."
        sendBroadcast(Intent(ACTION_FCM_MESSAGE).setPackage(packageName).putExtra("title", title).putExtra("message", body))
    }

    companion object { const val ACTION_FCM_MESSAGE = "com.example.kambus.FCM_MESSAGE" }
}
