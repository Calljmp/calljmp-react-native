package com.calljmp

import com.facebook.fbreact.specs.NativeCalljmpDeviceSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import java.security.MessageDigest

@ReactModule(name = NativeCalljmpDevice.NAME)
class NativeCalljmpDevice(reactContext: ReactApplicationContext) :
    NativeCalljmpDeviceSpec(reactContext) {

    private val integrityManager = IntegrityManagerFactory.create(reactContext)

    override fun androidRequestIntegrityToken(
        cloudProjectNumber: Double,
        data: String,
        promise: Promise
    ) {
        try {
            val dataBytes = data.toByteArray(Charsets.UTF_8)
            val digest = MessageDigest.getInstance("SHA-256")
            val hashedData = digest.digest(dataBytes)
            val nonce = hashedData.joinToString("") { "%02x".format(it) }

            val task = integrityManager.requestIntegrityToken(
                IntegrityTokenRequest.builder()
                    .setNonce(nonce)
                    .setCloudProjectNumber(cloudProjectNumber.toLong())
                    .build()
            )

            task.addOnSuccessListener { response ->
                promise.resolve(Arguments.createMap().apply {
                    putString("integrityToken", response.token())
                    putString("packageName", reactApplicationContext.packageName)
                })
            }.addOnFailureListener { e -> promise.reject("IntegrityError", e) }
        } catch (e: Exception) {
            promise.reject("IntegrityError", "Failed to process integrity token request", e)
        }
    }

    override fun appleGenerateAttestationKey(promise: Promise) {
        promise.reject(
            "Unsupported",
            "Apple Attestation Key generation is not available on Android"
        )
    }

    override fun appleAttestKey(keyId: String, data: String, promise: Promise) {
        promise.reject(
            "Unsupported",
            "Apple Attestation Key generation is not available on Android"
        )
    }

    companion object {
        const val NAME = NativeCalljmpDeviceSpec.NAME
    }
}