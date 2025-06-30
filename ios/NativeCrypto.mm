#import <CommonCrypto/CommonDigest.h>
#import "NativeCrypto.h"

@implementation NativeCalljmpCrypto

RCT_EXPORT_MODULE(NativeCalljmpCrypto);

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeCalljmpCryptoSpecJSI>(params);
}

- (void)sha256:(NSArray *)data resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  if (data.count == 0) {
    reject(@"invalid_params", @"Data array must not be empty", nil);
    return;
  }

  NSMutableData *dataBytes = [NSMutableData dataWithCapacity:data.count];
  for (NSNumber *item in data) {
    uint8_t byte = [item unsignedCharValue];
    [dataBytes appendBytes:&byte length:1];
  }

  uint8_t hash[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(dataBytes.bytes, static_cast<CC_LONG>(dataBytes.length), hash);

  NSMutableArray *result = [NSMutableArray arrayWithCapacity:CC_SHA256_DIGEST_LENGTH];
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
    [result addObject:@(hash[i])];
  }

  resolve(result);
}

- (void)uuid:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  NSString *uuid = [[NSUUID UUID] UUIDString];
  resolve(uuid);
}

@end
