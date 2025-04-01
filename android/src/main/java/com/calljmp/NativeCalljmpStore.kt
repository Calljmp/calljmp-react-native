package com.calljmp

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import com.facebook.fbreact.specs.NativeCalljmpStoreSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@ReactModule(name = NativeCalljmpStore.NAME)
class NativeCalljmpStore(reactContext: ReactApplicationContext) :
    NativeCalljmpStoreSpec(reactContext) {

    private val context = reactContext
    private val keyAlias = "CalljmpStoreKey"
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private val sharedPrefsName = "CalljmpSecurePrefs"
    private val ivPrefix = "iv_"

    private fun getOrCreateKey(): SecretKey {
        if (!keyStore.containsAlias(keyAlias)) {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
            )
            val keySpec = KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
            keyGenerator.init(keySpec)
            return keyGenerator.generateKey()
        }
        return keyStore.getKey(keyAlias, null) as SecretKey
    }

    override fun securePut(key: String, value: String, promise: Promise) {
        try {
            val secretKey = getOrCreateKey()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)

            val iv = cipher.iv
            val encryptedBytes = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))

            val encryptedValue = Base64.encodeToString(encryptedBytes, Base64.DEFAULT)
            val ivValue = Base64.encodeToString(iv, Base64.DEFAULT)

            context.getSharedPreferences(sharedPrefsName, Context.MODE_PRIVATE).edit {
                putString(key, encryptedValue)
                putString("$ivPrefix$key", ivValue)
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("encryption_error", "Failed to store item: ${e.message}")
        }
    }

    override fun secureGet(key: String, promise: Promise) {
        try {
            val prefs = context.getSharedPreferences(sharedPrefsName, Context.MODE_PRIVATE)
            val encryptedValue = prefs.getString(key, null)
            val ivValue = prefs.getString("$ivPrefix$key", null)

            if (encryptedValue == null || ivValue == null) {
                promise.resolve(null)
                return
            }

            val secretKey = getOrCreateKey()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val iv = Base64.decode(ivValue, Base64.DEFAULT)
            val spec = GCMParameterSpec(128, iv)

            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)
            val encryptedBytes = Base64.decode(encryptedValue, Base64.DEFAULT)
            val decryptedBytes = cipher.doFinal(encryptedBytes)

            promise.resolve(String(decryptedBytes, StandardCharsets.UTF_8))
        } catch (e: Exception) {
            promise.reject("decryption_error", "Failed to retrieve item: ${e.message}")
        }
    }

    override fun secureDelete(key: String, promise: Promise) {
        try {
            context.getSharedPreferences(sharedPrefsName, Context.MODE_PRIVATE).edit {
                remove(key)
                remove("$ivPrefix$key")
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("deletion_error", "Failed to delete item: ${e.message}")
        }
    }

    companion object {
        const val NAME = NativeCalljmpStoreSpec.NAME
    }
}