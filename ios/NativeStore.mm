#import "NativeStore.h"

@implementation NativeCalljmpStore {
}

RCT_EXPORT_MODULE(NativeCalljmpStore);

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeCalljmpStoreSpecJSI>(params);
}

- (void)securePut:(NSString *)key
      value:(NSString *)value
      resolve:(RCTPromiseResolveBlock)resolve
       reject:(RCTPromiseRejectBlock)reject {
  if (!key || !value) {
    reject(@"invalid_params", @"Both key and value must be provided", nil);
    return;
  }

  NSData *valueData = [value dataUsingEncoding:NSUTF8StringEncoding];

  NSMutableDictionary *query = [NSMutableDictionary dictionary];
  [query setObject:(__bridge id)kSecClassGenericPassword forKey:(__bridge id)kSecClass];
  [query setObject:key forKey:(__bridge id)kSecAttrAccount];
  [query setObject:valueData forKey:(__bridge id)kSecValueData];
  [query setObject:@YES forKey:(__bridge id)kSecAttrIsInvisible];

  SecItemDelete((__bridge CFDictionaryRef)query);

  OSStatus status = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
  
  if (status == errSecSuccess) {
    resolve(@YES);
  } else {
    NSString *errorMessage = [NSString stringWithFormat:@"Failed to store item: %d", (int)status];
    reject(@"keychain_error", errorMessage, nil);
  }
}

- (void)secureGet:(NSString *)key
      resolve:(RCTPromiseResolveBlock)resolve
       reject:(RCTPromiseRejectBlock)reject {
  if (!key) {
    reject(@"invalid_params", @"Key must be provided", nil);
    return;
  }

  NSMutableDictionary *query = [NSMutableDictionary dictionary];
  [query setObject:(__bridge id)kSecClassGenericPassword forKey:(__bridge id)kSecClass];
  [query setObject:key forKey:(__bridge id)kSecAttrAccount];
  [query setObject:@YES forKey:(__bridge id)kSecReturnData];
  [query setObject:(__bridge id)kSecMatchLimitOne forKey:(__bridge id)kSecMatchLimit];

  CFDataRef resultData = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, (CFTypeRef *)&resultData);
  
  if (status == errSecSuccess && resultData) {
    NSString *value = [[NSString alloc] initWithData:(__bridge_transfer NSData *)resultData 
                      encoding:NSUTF8StringEncoding];
    resolve(value);
  } else if (status == errSecItemNotFound) {
    resolve([NSNull null]);
  } else {
    NSString *errorMessage = [NSString stringWithFormat:@"Failed to retrieve item: %d", (int)status];
    reject(@"keychain_error", errorMessage, nil);
  }
}

- (void)secureDelete:(NSString *)key
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject {
  if (!key) {
    reject(@"invalid_params", @"Key must be provided", nil);
    return;
  }

  NSMutableDictionary *query = [NSMutableDictionary dictionary];
  [query setObject:(__bridge id)kSecClassGenericPassword forKey:(__bridge id)kSecClass];
  [query setObject:key forKey:(__bridge id)kSecAttrAccount];

  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)query);
  
  if (status == errSecSuccess || status == errSecItemNotFound) {
    resolve(@YES);
  } else {
    NSString *errorMessage = [NSString stringWithFormat:@"Failed to delete item: %d", (int)status];
    reject(@"keychain_error", errorMessage, nil);
  }
}

@end
