package com.calljmp

import com.facebook.fbreact.specs.NativeCalljmpCryptoSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import java.security.MessageDigest
import java.util.UUID

@ReactModule(name = NativeCalljmpCrypto.NAME)
class NativeCalljmpCrypto(reactContext: ReactApplicationContext) :
    NativeCalljmpCryptoSpec(reactContext) {

    override fun sha256(data: ReadableArray, promise: Promise) {
        try {
            val byteArray = ByteArray(data.size())
            for (i in 0 until data.size()) {
                byteArray[i] = data.getInt(i).toByte()
            }

            val digest = MessageDigest.getInstance("SHA-256")
            val hash = digest.digest(byteArray)

            val writableArray = Arguments.createArray()
            for (byte in hash) {
                writableArray.pushInt(byte.toInt() and 0xFF)
            }

            promise.resolve(writableArray)
        } catch (e: Exception) {
            promise.reject("HashError", "Failed to compute SHA-256 hash", e)
        }
    }

    override fun uuid(promise: Promise) {
        try {
            val uuid = UUID.randomUUID().toString()
            promise.resolve(uuid)
        } catch (e: Exception) {
            promise.reject("UuidError", "Failed to get UUID", e)
        }
    }

    companion object {
        const val NAME = NativeCalljmpCryptoSpec.NAME
    }
}