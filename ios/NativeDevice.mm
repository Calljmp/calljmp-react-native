#import <DeviceCheck/DeviceCheck.h>
#import <CommonCrypto/CommonDigest.h>

#import "NativeDevice.h"

@implementation NativeDevice {
  DCAppAttestService *_attestService;
}

RCT_EXPORT_MODULE(NativeDevice);

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeDeviceSpecJSI>(params);
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    if (@available(iOS 14.0, *)) {
      _attestService = [DCAppAttestService sharedService];
    }
  }
  return self;
}

- (NSNumber *)isSimulator {
#if TARGET_IPHONE_SIMULATOR
  return @YES;
#else
  return @NO;
#endif
}

- (void)appleGenerateAttestationKey:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { 
  if (@available(iOS 14.0, *)) {
    if (![_attestService isSupported]) {
      reject(@"unsupported", @"Unsupported device check", nil);
      return;
    }

    [_attestService generateKeyWithCompletionHandler:^(NSString * _Nullable keyId, NSError * _Nullable error) {
      if (error) {
        reject(@"notGenerated", @"Failed to generate key", error);
        return;
      }
      resolve(keyId);
    }];
  } else {
    reject(@"unsupported", @"Unsupported device check", nil);
  }
}

- (void)appleAttestKey:(NSString *)keyId data:(NSString *)data resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  if (@available(iOS 14.0, *)) {
    if (![_attestService isSupported]) {
      reject(@"unsupported", @"Unsupported device check", nil);
      return;
    }

    NSData *dataBytes = [data dataUsingEncoding:NSUTF8StringEncoding];
    NSMutableData *hashData = [NSMutableData dataWithLength:CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(dataBytes.bytes, static_cast<CC_LONG>(dataBytes.length), static_cast<unsigned char*>(hashData.mutableBytes));

    [_attestService attestKey:keyId clientDataHash:hashData completionHandler:^(NSData * _Nullable attestationObject, NSError * _Nullable error) {
      if (error) {
        reject(@"attestationFailed", @"Failed to attest key", error);
        return;
      }

      NSString *attestationString = [attestationObject base64EncodedStringWithOptions:0];
      NSString *bundleId = [[NSBundle mainBundle] bundleIdentifier];

      resolve(@{
        @"keyId": keyId,
        @"bundleId": bundleId,
        @"attestation": attestationString
      });
    }];
  } else {
    reject(@"unsupported", @"Unsupported device check", nil);
  }
}

@end
