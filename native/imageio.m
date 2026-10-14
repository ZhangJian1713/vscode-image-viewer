#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>
#include <node_api.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    napi_async_work work;
    napi_deferred deferred;
    char *path;
    int edge;
    double quality;
    unsigned char *bytes;
    size_t length;
    char error[256];
} ThumbnailRequest;

static void encode_thumbnail(ThumbnailRequest *request) {
    CFStringRef path = NULL;
    CFURLRef url = NULL;
    CGImageSourceRef source = NULL;
    CFDictionaryRef properties = NULL, source_options = NULL, thumb_options = NULL, encode_options = NULL;
    CFNumberRef edge_number = NULL, quality_number = NULL;
    CGImageRef thumbnail = NULL, opaque = NULL;
    CGColorSpaceRef color_space = NULL;
    CGContextRef bitmap = NULL;
    CFMutableDataRef data = NULL;
    CGImageDestinationRef destination = NULL;
    const char *failure = "ImageIO could not open the source image";

    path = CFStringCreateWithCString(NULL, request->path, kCFStringEncodingUTF8);
    if (!path) goto cleanup;
    url = CFURLCreateWithFileSystemPath(NULL, path, kCFURLPOSIXPathStyle, false);
    if (!url) goto cleanup;
    const void *source_keys[] = { kCGImageSourceShouldCache, kCGImageSourceShouldCacheImmediately };
    const void *source_values[] = { kCFBooleanFalse, kCFBooleanFalse };
    source_options = CFDictionaryCreate(NULL, source_keys, source_values, 2,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    source = CGImageSourceCreateWithURL(url, source_options);
    if (!source) goto cleanup;

    // 只读取属性并限制目标边长，不先物化完整原图，也不放大小源图。
    int edge = request->edge;
    properties = CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
    if (properties) {
        int width = 0, height = 0;
        CFNumberRef w = CFDictionaryGetValue(properties, kCGImagePropertyPixelWidth);
        CFNumberRef h = CFDictionaryGetValue(properties, kCGImagePropertyPixelHeight);
        if (w && CFGetTypeID(w) == CFNumberGetTypeID()) CFNumberGetValue(w, kCFNumberIntType, &width);
        if (h && CFGetTypeID(h) == CFNumberGetTypeID()) CFNumberGetValue(h, kCFNumberIntType, &height);
        if (width > 0 && height > 0) edge = MIN(edge, MAX(width, height));
    }
    edge_number = CFNumberCreate(NULL, kCFNumberIntType, &edge);
    const void *thumb_keys[] = { kCGImageSourceCreateThumbnailFromImageAlways,
        kCGImageSourceCreateThumbnailWithTransform, kCGImageSourceThumbnailMaxPixelSize, kCGImageSourceShouldCache };
    const void *thumb_values[] = { kCFBooleanTrue, kCFBooleanTrue, edge_number, kCFBooleanFalse };
    thumb_options = CFDictionaryCreate(NULL, thumb_keys, thumb_values, 4,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, thumb_options);
    failure = "ImageIO could not decode the source image";
    if (!thumbnail) goto cleanup;
    if (!CGImageGetWidth(thumbnail) || !CGImageGetHeight(thumbnail) ||
        MAX(CGImageGetWidth(thumbnail), CGImageGetHeight(thumbnail)) > (size_t)request->edge) goto cleanup;

    // 沿用 JPEG 缓存协议。透明像素合成到白色，不能丢弃 alpha 后变成黑边。
    CGImageAlphaInfo alpha = CGImageGetAlphaInfo(thumbnail);
    if (alpha == kCGImageAlphaFirst || alpha == kCGImageAlphaLast ||
        alpha == kCGImageAlphaPremultipliedFirst || alpha == kCGImageAlphaPremultipliedLast || alpha == kCGImageAlphaOnly) {
        size_t width = CGImageGetWidth(thumbnail), height = CGImageGetHeight(thumbnail);
        color_space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
        bitmap = CGBitmapContextCreate(NULL, width, height, 8, width * 4, color_space,
            kCGImageAlphaNoneSkipLast | kCGBitmapByteOrder32Big);
        failure = "ImageIO could not create an opaque thumbnail";
        if (!bitmap) goto cleanup;
        CGContextSetRGBFillColor(bitmap, 1, 1, 1, 1);
        CGContextFillRect(bitmap, CGRectMake(0, 0, width, height));
        CGContextDrawImage(bitmap, CGRectMake(0, 0, width, height), thumbnail);
        opaque = CGBitmapContextCreateImage(bitmap);
        if (!opaque) goto cleanup;
    }

    data = CFDataCreateMutable(NULL, 0);
    if (!data) goto cleanup;
    destination = CGImageDestinationCreateWithData(data, CFSTR("public.jpeg"), 1, NULL);
    failure = "ImageIO could not encode the thumbnail";
    if (!destination) goto cleanup;
    quality_number = CFNumberCreate(NULL, kCFNumberDoubleType, &request->quality);
    const void *encode_keys[] = { kCGImageDestinationLossyCompressionQuality };
    const void *encode_values[] = { quality_number };
    encode_options = CFDictionaryCreate(NULL, encode_keys, encode_values, 1,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CGImageDestinationAddImage(destination, opaque ? opaque : thumbnail, encode_options);
    if (!CGImageDestinationFinalize(destination)) goto cleanup;
    request->length = (size_t)CFDataGetLength(data);
    request->bytes = malloc(request->length);
    failure = "ImageIO could not allocate thumbnail bytes";
    if (!request->bytes || !request->length) goto cleanup;
    memcpy(request->bytes, CFDataGetBytePtr(data), request->length);
    failure = NULL;

cleanup:
    if (failure) snprintf(request->error, sizeof(request->error), "%s", failure);
    if (destination) CFRelease(destination);
    if (encode_options) CFRelease(encode_options);
    if (quality_number) CFRelease(quality_number);
    if (data) CFRelease(data);
    if (opaque) CGImageRelease(opaque);
    if (bitmap) CGContextRelease(bitmap);
    if (color_space) CGColorSpaceRelease(color_space);
    if (thumbnail) CGImageRelease(thumbnail);
    if (thumb_options) CFRelease(thumb_options);
    if (edge_number) CFRelease(edge_number);
    if (properties) CFRelease(properties);
    if (source) CFRelease(source);
    if (source_options) CFRelease(source_options);
    if (url) CFRelease(url);
    if (path) CFRelease(path);
}

static void execute(napi_env env, void *data) {
    (void)env;
    // Node-API 工作线程中不得调用 JS API；每个任务独立释放系统的临时对象。
    @autoreleasepool { encode_thumbnail(data); }
}

static void complete(napi_env env, napi_status status, void *data) {
    ThumbnailRequest *request = data;
    napi_value result = NULL;
    if (status == napi_ok && !request->error[0]) {
        // 使用 Node 管理的 Buffer，兼容 Electron 不允许 external buffer 的构建。
        status = napi_create_buffer_copy(env, request->length, request->bytes, NULL, &result);
    }
    if (status == napi_ok && !request->error[0]) {
        napi_resolve_deferred(env, request->deferred, result);
    } else {
        napi_value message = NULL, error = NULL;
        if (napi_create_string_utf8(env, request->error[0] ? request->error : "ImageIO task cancelled or failed", NAPI_AUTO_LENGTH, &message) == napi_ok &&
            napi_create_error(env, NULL, message, &error) == napi_ok) {
            napi_reject_deferred(env, request->deferred, error);
        }
    }
    napi_delete_async_work(env, request->work);
    free(request->path);
    free(request->bytes);
    free(request);
}

static napi_value generate_thumbnail(napi_env env, napi_callback_info info) {
    napi_value args[3], promise, resource_name;
    size_t argc = 3, length = 0;
    double edge = 0, quality = 0;
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    if (argc != 3 || napi_get_value_string_utf8(env, args[0], NULL, 0, &length) != napi_ok ||
        !length || length > 1024 * 1024 || napi_get_value_double(env, args[1], &edge) != napi_ok ||
        napi_get_value_double(env, args[2], &quality) != napi_ok || !isfinite(edge) || edge != floor(edge) ||
        edge < 1 || edge > 1600 || !isfinite(quality) || quality < 1 || quality > 100) {
        napi_throw_type_error(env, NULL, "Expected absolute path, integer edge 1–1600, and quality 1–100");
        return NULL;
    }
    ThumbnailRequest *request = calloc(1, sizeof(*request));
    if (!request || !(request->path = malloc(length + 1))) {
        free(request);
        napi_throw_error(env, NULL, "Unable to allocate ImageIO request");
        return NULL;
    }
    napi_get_value_string_utf8(env, args[0], request->path, length + 1, &length);
    if (request->path[0] != '/' || memchr(request->path, '\0', length)) {
        free(request->path);
        free(request);
        napi_throw_type_error(env, NULL, "ImageIO requires an absolute path without null bytes");
        return NULL;
    }
    request->edge = (int)edge;
    request->quality = quality / 100.0;
    napi_status status = napi_create_promise(env, &request->deferred, &promise);
    if (status == napi_ok) status = napi_create_string_utf8(env, "ImageViewer.ImageIO", NAPI_AUTO_LENGTH, &resource_name);
    if (status == napi_ok) status = napi_create_async_work(env, NULL, resource_name, execute, complete, request, &request->work);
    if (status == napi_ok) status = napi_queue_async_work(env, request->work);
    if (status != napi_ok) {
        if (request->work) napi_delete_async_work(env, request->work);
        free(request->path);
        free(request);
        napi_throw_error(env, NULL, "Unable to schedule ImageIO task");
        return NULL;
    }
    return promise;
}

static napi_value initialize(napi_env env, napi_value exports) {
    const napi_property_descriptor descriptor = { "generateThumbnail", NULL, generate_thumbnail, NULL, NULL, NULL, napi_default, NULL };
    if (napi_define_properties(env, exports, 1, &descriptor) != napi_ok) return NULL;
    return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
