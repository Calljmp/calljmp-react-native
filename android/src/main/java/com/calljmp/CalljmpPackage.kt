package com.calljmp

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class CalljmpPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return when (name) {
            NativeCalljmpDevice.NAME -> NativeCalljmpDevice(reactContext)
            NativeCalljmpStore.NAME -> NativeCalljmpStore(reactContext)
            NativeCalljmpCrypto.NAME -> NativeCalljmpCrypto(reactContext)
            else -> null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
            moduleInfos[NativeCalljmpDevice.NAME] = ReactModuleInfo(
                name = NativeCalljmpDevice.NAME,
                className = NativeCalljmpDevice.NAME,
                canOverrideExistingModule = false,
                needsEagerInit = false,
                isCxxModule = false,
                isTurboModule = true,
            )
            moduleInfos[NativeCalljmpStore.NAME] = ReactModuleInfo(
                name = NativeCalljmpStore.NAME,
                className = NativeCalljmpStore.NAME,
                canOverrideExistingModule = false,
                needsEagerInit = false,
                isCxxModule = false,
                isTurboModule = true,
            )
            moduleInfos[NativeCalljmpCrypto.NAME] = ReactModuleInfo(
                name = NativeCalljmpCrypto.NAME,
                className = NativeCalljmpCrypto.NAME,
                canOverrideExistingModule = false,
                needsEagerInit = false,
                isCxxModule = false,
                isTurboModule = true,
            )
            moduleInfos
        }
    }
}