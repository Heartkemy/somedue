// Only the verified bundled app may use this helper. Passwords stay in Keychain.
#include <Security/Security.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/resource.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifndef SOMEDUE_SIGNER
#error SOMEDUE_SIGNER must identify the persistent signing certificate
#endif
#define MAX_SECRET (64 * 1024)

static OSStatus authorize(void) {
    pid_t peer = 0;
    socklen_t size = sizeof(peer);
    if (getsockopt(STDOUT_FILENO, SOL_LOCAL, LOCAL_PEERPID, &peer, &size) || peer <= 1 || peer != getppid()) return errSecAuthFailed;
    CFNumberRef pid = CFNumberCreate(NULL, kCFNumberIntType, &peer);
    const void *keys[] = {kSecGuestAttributePid}, *values[] = {pid};
    CFDictionaryRef attrs = CFDictionaryCreate(NULL, keys, values, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    SecCodeRef code = NULL;
    SecRequirementRef requirement = NULL;
    OSStatus status = SecCodeCopyGuestWithAttributes(NULL, attrs, kSecCSDefaultFlags, &code);
    if (!status) status = SecRequirementCreateWithString(CFSTR("identifier \"io.somedue.desktop\" and certificate leaf = H\"" SOMEDUE_SIGNER "\""), kSecCSDefaultFlags, &requirement);
    if (!status) status = SecCodeCheckValidity(code, kSecCSStrictValidate, requirement);
    if (requirement) CFRelease(requirement);
    if (code) CFRelease(code);
    CFRelease(attrs); CFRelease(pid);
    return status;
}

int main(int argc, char **argv) {
    struct rlimit limit = {0, 0};
    setrlimit(RLIMIT_CORE, &limit);
    if (argc != 3 || strlen(argv[2]) == 0 || strlen(argv[2]) > 512 ||
        (strcmp(argv[1], "get") && strcmp(argv[1], "set") && strcmp(argv[1], "delete"))) return 2;
    OSStatus status = authorize();
    if (status) { fprintf(stderr, "Keychain caller denied (%d)\n", (int)status); return 1; }
    CFStringRef account = CFStringCreateWithCString(NULL, argv[2], kCFStringEncodingUTF8);
    if (!account) return 2;
    CFMutableDictionaryRef query = CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(query, kSecAttrService, CFSTR("io.somedue.desktop.things-cloud.v1"));
    CFDictionarySetValue(query, kSecAttrAccount, account);
    CFDataRef data = NULL;
    unsigned char *secret = calloc(MAX_SECRET + 1, 1);
    if (!secret) { CFRelease(query); CFRelease(account); return 1; }
    if (!strcmp(argv[1], "set")) {
        size_t used = 0;
        while (used <= MAX_SECRET) {
            ssize_t count = read(STDIN_FILENO, secret + used, MAX_SECRET + 1 - used);
            if (count < 0) { status = errSecIO; break; }
            if (!count) break;
            used += (size_t)count;
            if (used > MAX_SECRET) { status = errSecParam; break; }
        }
        if (!used) status = errSecParam;
        if (!status) {
            data = CFDataCreate(NULL, secret, (CFIndex)used);
            const void *keys[] = {kSecValueData}, *values[] = {data};
            CFDictionaryRef update = CFDictionaryCreate(NULL, keys, values, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
            status = SecItemUpdate(query, update);
            CFRelease(update);
            if (status == errSecItemNotFound) {
                CFDictionarySetValue(query, kSecValueData, data);
                status = SecItemAdd(query, NULL);
            }
        }
    } else if (!strcmp(argv[1], "get")) {
        CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
        status = SecItemCopyMatching(query, (CFTypeRef *)&data);
        if (!status) {
            if (!data || CFGetTypeID(data) != CFDataGetTypeID() || CFDataGetLength(data) <= 0 || CFDataGetLength(data) > MAX_SECRET) status = errSecDecode;
            else {
                size_t length = (size_t)CFDataGetLength(data), sent = 0;
                while (sent < length) {
                    ssize_t count = write(STDOUT_FILENO, CFDataGetBytePtr(data) + sent, length - sent);
                    if (count <= 0) { status = errSecIO; break; }
                    sent += (size_t)count;
                }
            }
        }
    } else {
        status = SecItemDelete(query);
        if (status == errSecItemNotFound) status = 0;
    }
    memset_s(secret, MAX_SECRET + 1, 0, MAX_SECRET + 1); free(secret);
    if (data) CFRelease(data);
    CFRelease(query); CFRelease(account);
    if (status) fprintf(stderr, "Keychain operation failed (%d)\n", (int)status);
    return status ? 1 : 0;
}
