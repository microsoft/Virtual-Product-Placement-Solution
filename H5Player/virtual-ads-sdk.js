(() => {
  var __create = Object.create;
  var __getProtoOf = Object.getPrototypeOf;
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __toESM = (mod, isNodeMode, target) => {
    target = mod != null ? __create(__getProtoOf(mod)) : {};
    const to =
      isNodeMode || !mod || !mod.__esModule
        ? __defProp(target, "default", { value: mod, enumerable: true })
        : target;
    for (let key of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key))
        __defProp(to, key, {
          get: () => mod[key],
          enumerable: true,
        });
    return to;
  };
  var __moduleCache = /* @__PURE__ */ new WeakMap();
  var __toCommonJS = (from) => {
    var entry = __moduleCache.get(from),
      desc;
    if (entry) return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if ((from && typeof from === "object") || typeof from === "function")
      __getOwnPropNames(from).map(
        (key) =>
          !__hasOwnProp.call(entry, key) &&
          __defProp(entry, key, {
            get: () => from[key],
            enumerable:
              !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
          }),
      );
    __moduleCache.set(from, entry);
    return entry;
  };
  var __commonJS = (cb, mod) => () => (
    mod || cb((mod = { exports: {} }).exports, mod),
    mod.exports
  );
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: (newValue) => (all[name] = () => newValue),
      });
  };

  // node_modules/js-binary-schema-parser/lib/index.js
  var require_lib = __commonJS((exports) => {
    Object.defineProperty(exports, "__esModule", {
      value: true,
    });
    exports.loop = exports.conditional = exports.parse = undefined;
    var parse = function parse(stream, schema) {
      var result =
        arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      var parent =
        arguments.length > 3 && arguments[3] !== undefined
          ? arguments[3]
          : result;
      if (Array.isArray(schema)) {
        schema.forEach(function (partSchema) {
          return parse(stream, partSchema, result, parent);
        });
      } else if (typeof schema === "function") {
        schema(stream, result, parent, parse);
      } else {
        var key = Object.keys(schema)[0];
        if (Array.isArray(schema[key])) {
          parent[key] = {};
          parse(stream, schema[key], result, parent[key]);
        } else {
          parent[key] = schema[key](stream, result, parent, parse);
        }
      }
      return result;
    };
    exports.parse = parse;
    var conditional = function conditional(schema, conditionFunc) {
      return function (stream, result, parent, parse2) {
        if (conditionFunc(stream, result, parent)) {
          parse2(stream, schema, result, parent);
        }
      };
    };
    exports.conditional = conditional;
    var loop = function loop(schema, continueFunc) {
      return function (stream, result, parent, parse2) {
        var arr = [];
        var lastStreamPos = stream.pos;
        while (continueFunc(stream, result, parent)) {
          var newParent = {};
          parse2(stream, schema, result, newParent);
          if (stream.pos === lastStreamPos) {
            break;
          }
          lastStreamPos = stream.pos;
          arr.push(newParent);
        }
        return arr;
      };
    };
    exports.loop = loop;
  });

  // node_modules/js-binary-schema-parser/lib/parsers/uint8.js
  var require_uint8 = __commonJS((exports) => {
    Object.defineProperty(exports, "__esModule", {
      value: true,
    });
    exports.readBits =
      exports.readArray =
      exports.readUnsigned =
      exports.readString =
      exports.peekBytes =
      exports.readBytes =
      exports.peekByte =
      exports.readByte =
      exports.buildStream =
        undefined;
    var buildStream = function buildStream(uint8Data) {
      return {
        data: uint8Data,
        pos: 0,
      };
    };
    exports.buildStream = buildStream;
    var readByte = function readByte() {
      return function (stream) {
        return stream.data[stream.pos++];
      };
    };
    exports.readByte = readByte;
    var peekByte = function peekByte() {
      var offset =
        arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      return function (stream) {
        return stream.data[stream.pos + offset];
      };
    };
    exports.peekByte = peekByte;
    var readBytes2 = function readBytes(length2) {
      return function (stream) {
        return stream.data.subarray(stream.pos, (stream.pos += length2));
      };
    };
    exports.readBytes = readBytes2;
    var peekBytes = function peekBytes(length2) {
      return function (stream) {
        return stream.data.subarray(stream.pos, stream.pos + length2);
      };
    };
    exports.peekBytes = peekBytes;
    var readString = function readString(length2) {
      return function (stream) {
        return Array.from(readBytes2(length2)(stream))
          .map(function (value) {
            return String.fromCharCode(value);
          })
          .join("");
      };
    };
    exports.readString = readString;
    var readUnsigned = function readUnsigned(littleEndian) {
      return function (stream) {
        var bytes = readBytes2(2)(stream);
        return littleEndian
          ? (bytes[1] << 8) + bytes[0]
          : (bytes[0] << 8) + bytes[1];
      };
    };
    exports.readUnsigned = readUnsigned;
    var readArray = function readArray(byteSize, totalOrFunc) {
      return function (stream, result, parent) {
        var total =
          typeof totalOrFunc === "function"
            ? totalOrFunc(stream, result, parent)
            : totalOrFunc;
        var parser = readBytes2(byteSize);
        var arr = new Array(total);
        for (var i = 0; i < total; i++) {
          arr[i] = parser(stream);
        }
        return arr;
      };
    };
    exports.readArray = readArray;
    var subBitsTotal = function subBitsTotal(bits, startIndex, length2) {
      var result = 0;
      for (var i = 0; i < length2; i++) {
        result += bits[startIndex + i] && Math.pow(2, length2 - i - 1);
      }
      return result;
    };
    var readBits = function readBits(schema) {
      return function (stream) {
        var _byte = readByte()(stream);
        var bits = new Array(8);
        for (var i = 0; i < 8; i++) {
          bits[7 - i] = !!(_byte & (1 << i));
        }
        return Object.keys(schema).reduce(function (res, key) {
          var def = schema[key];
          if (def.length) {
            res[key] = subBitsTotal(bits, def.index, def.length);
          } else {
            res[key] = bits[def.index];
          }
          return res;
        }, {});
      };
    };
    exports.readBits = readBits;
  });

  // node_modules/js-binary-schema-parser/lib/schemas/gif.js
  var require_gif = __commonJS((exports) => {
    Object.defineProperty(exports, "__esModule", {
      value: true,
    });
    exports["default"] = undefined;
    var _ = require_lib();
    var _uint = require_uint8();
    var subBlocksSchema = {
      blocks: function blocks(stream) {
        var terminator = 0;
        var chunks = [];
        var streamSize = stream.data.length;
        var total = 0;
        for (
          var size = (0, _uint.readByte)()(stream);
          size !== terminator;
          size = (0, _uint.readByte)()(stream)
        ) {
          if (!size) break;
          if (stream.pos + size >= streamSize) {
            var availableSize = streamSize - stream.pos;
            chunks.push((0, _uint.readBytes)(availableSize)(stream));
            total += availableSize;
            break;
          }
          chunks.push((0, _uint.readBytes)(size)(stream));
          total += size;
        }
        var result = new Uint8Array(total);
        var offset = 0;
        for (var i = 0; i < chunks.length; i++) {
          result.set(chunks[i], offset);
          offset += chunks[i].length;
        }
        return result;
      },
    };
    var gceSchema = (0, _.conditional)(
      {
        gce: [
          {
            codes: (0, _uint.readBytes)(2),
          },
          {
            byteSize: (0, _uint.readByte)(),
          },
          {
            extras: (0, _uint.readBits)({
              future: {
                index: 0,
                length: 3,
              },
              disposal: {
                index: 3,
                length: 3,
              },
              userInput: {
                index: 6,
              },
              transparentColorGiven: {
                index: 7,
              },
            }),
          },
          {
            delay: (0, _uint.readUnsigned)(true),
          },
          {
            transparentColorIndex: (0, _uint.readByte)(),
          },
          {
            terminator: (0, _uint.readByte)(),
          },
        ],
      },
      function (stream) {
        var codes = (0, _uint.peekBytes)(2)(stream);
        return codes[0] === 33 && codes[1] === 249;
      },
    );
    var imageSchema = (0, _.conditional)(
      {
        image: [
          {
            code: (0, _uint.readByte)(),
          },
          {
            descriptor: [
              {
                left: (0, _uint.readUnsigned)(true),
              },
              {
                top: (0, _uint.readUnsigned)(true),
              },
              {
                width: (0, _uint.readUnsigned)(true),
              },
              {
                height: (0, _uint.readUnsigned)(true),
              },
              {
                lct: (0, _uint.readBits)({
                  exists: {
                    index: 0,
                  },
                  interlaced: {
                    index: 1,
                  },
                  sort: {
                    index: 2,
                  },
                  future: {
                    index: 3,
                    length: 2,
                  },
                  size: {
                    index: 5,
                    length: 3,
                  },
                }),
              },
            ],
          },
          (0, _.conditional)(
            {
              lct: (0, _uint.readArray)(3, function (stream, result, parent) {
                return Math.pow(2, parent.descriptor.lct.size + 1);
              }),
            },
            function (stream, result, parent) {
              return parent.descriptor.lct.exists;
            },
          ),
          {
            data: [
              {
                minCodeSize: (0, _uint.readByte)(),
              },
              subBlocksSchema,
            ],
          },
        ],
      },
      function (stream) {
        return (0, _uint.peekByte)()(stream) === 44;
      },
    );
    var textSchema = (0, _.conditional)(
      {
        text: [
          {
            codes: (0, _uint.readBytes)(2),
          },
          {
            blockSize: (0, _uint.readByte)(),
          },
          {
            preData: function preData(stream, result, parent) {
              return (0, _uint.readBytes)(parent.text.blockSize)(stream);
            },
          },
          subBlocksSchema,
        ],
      },
      function (stream) {
        var codes = (0, _uint.peekBytes)(2)(stream);
        return codes[0] === 33 && codes[1] === 1;
      },
    );
    var applicationSchema = (0, _.conditional)(
      {
        application: [
          {
            codes: (0, _uint.readBytes)(2),
          },
          {
            blockSize: (0, _uint.readByte)(),
          },
          {
            id: function id(stream, result, parent) {
              return (0, _uint.readString)(parent.blockSize)(stream);
            },
          },
          subBlocksSchema,
        ],
      },
      function (stream) {
        var codes = (0, _uint.peekBytes)(2)(stream);
        return codes[0] === 33 && codes[1] === 255;
      },
    );
    var commentSchema = (0, _.conditional)(
      {
        comment: [
          {
            codes: (0, _uint.readBytes)(2),
          },
          subBlocksSchema,
        ],
      },
      function (stream) {
        var codes = (0, _uint.peekBytes)(2)(stream);
        return codes[0] === 33 && codes[1] === 254;
      },
    );
    var schema = [
      {
        header: [
          {
            signature: (0, _uint.readString)(3),
          },
          {
            version: (0, _uint.readString)(3),
          },
        ],
      },
      {
        lsd: [
          {
            width: (0, _uint.readUnsigned)(true),
          },
          {
            height: (0, _uint.readUnsigned)(true),
          },
          {
            gct: (0, _uint.readBits)({
              exists: {
                index: 0,
              },
              resolution: {
                index: 1,
                length: 3,
              },
              sort: {
                index: 4,
              },
              size: {
                index: 5,
                length: 3,
              },
            }),
          },
          {
            backgroundColorIndex: (0, _uint.readByte)(),
          },
          {
            pixelAspectRatio: (0, _uint.readByte)(),
          },
        ],
      },
      (0, _.conditional)(
        {
          gct: (0, _uint.readArray)(3, function (stream, result) {
            return Math.pow(2, result.lsd.gct.size + 1);
          }),
        },
        function (stream, result) {
          return result.lsd.gct.exists;
        },
      ),
      {
        frames: (0, _.loop)(
          [
            gceSchema,
            applicationSchema,
            commentSchema,
            imageSchema,
            textSchema,
          ],
          function (stream) {
            var nextCode = (0, _uint.peekByte)()(stream);
            return nextCode === 33 || nextCode === 44;
          },
        ),
      },
    ];
    var _default = schema;
    exports["default"] = _default;
  });

  // node_modules/gifuct-js/lib/deinterlace.js
  var require_deinterlace = __commonJS((exports) => {
    Object.defineProperty(exports, "__esModule", {
      value: true,
    });
    exports.deinterlace = undefined;
    var deinterlace = function deinterlace(pixels, width) {
      var newPixels = new Array(pixels.length);
      var rows = pixels.length / width;
      var cpRow = function cpRow(toRow2, fromRow2) {
        var fromPixels = pixels.slice(fromRow2 * width, (fromRow2 + 1) * width);
        newPixels.splice.apply(
          newPixels,
          [toRow2 * width, width].concat(fromPixels),
        );
      };
      var offsets = [0, 4, 2, 1];
      var steps = [8, 8, 4, 2];
      var fromRow = 0;
      for (var pass = 0; pass < 4; pass++) {
        for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
          cpRow(toRow, fromRow);
          fromRow++;
        }
      }
      return newPixels;
    };
    exports.deinterlace = deinterlace;
  });

  // node_modules/gifuct-js/lib/lzw.js
  var require_lzw = __commonJS((exports) => {
    Object.defineProperty(exports, "__esModule", {
      value: true,
    });
    exports.lzw = undefined;
    var lzw = function lzw(minCodeSize, data, pixelCount) {
      var MAX_STACK_SIZE = 4096;
      var nullCode = -1;
      var npix = pixelCount;
      var available,
        clear,
        code_mask,
        code_size,
        end_of_information,
        in_code,
        old_code,
        bits,
        code,
        i,
        datum,
        data_size,
        first,
        top,
        bi,
        pi;
      var dstPixels = new Array(pixelCount);
      var prefix = new Array(MAX_STACK_SIZE);
      var suffix = new Array(MAX_STACK_SIZE);
      var pixelStack = new Array(MAX_STACK_SIZE + 1);
      data_size = minCodeSize;
      clear = 1 << data_size;
      end_of_information = clear + 1;
      available = clear + 2;
      old_code = nullCode;
      code_size = data_size + 1;
      code_mask = (1 << code_size) - 1;
      for (code = 0; code < clear; code++) {
        prefix[code] = 0;
        suffix[code] = code;
      }
      var datum, bits, count, first, top, pi, bi;
      datum = bits = count = first = top = pi = bi = 0;
      for (i = 0; i < npix; ) {
        if (top === 0) {
          if (bits < code_size) {
            datum += data[bi] << bits;
            bits += 8;
            bi++;
            continue;
          }
          code = datum & code_mask;
          datum >>= code_size;
          bits -= code_size;
          if (code > available || code == end_of_information) {
            break;
          }
          if (code == clear) {
            code_size = data_size + 1;
            code_mask = (1 << code_size) - 1;
            available = clear + 2;
            old_code = nullCode;
            continue;
          }
          if (old_code == nullCode) {
            pixelStack[top++] = suffix[code];
            old_code = code;
            first = code;
            continue;
          }
          in_code = code;
          if (code == available) {
            pixelStack[top++] = first;
            code = old_code;
          }
          while (code > clear) {
            pixelStack[top++] = suffix[code];
            code = prefix[code];
          }
          first = suffix[code] & 255;
          pixelStack[top++] = first;
          if (available < MAX_STACK_SIZE) {
            prefix[available] = old_code;
            suffix[available] = first;
            available++;
            if ((available & code_mask) === 0 && available < MAX_STACK_SIZE) {
              code_size++;
              code_mask += available;
            }
          }
          old_code = in_code;
        }
        top--;
        dstPixels[pi++] = pixelStack[top];
        i++;
      }
      for (i = pi; i < npix; i++) {
        dstPixels[i] = 0;
      }
      return dstPixels;
    };
    exports.lzw = lzw;
  });

  // node_modules/gifuct-js/lib/index.js
  var require_lib2 = __commonJS((exports) => {
    Object.defineProperty(exports, "__esModule", {
      value: true,
    });
    exports.decompressFrames =
      exports.decompressFrame =
      exports.parseGIF =
        undefined;
    var _gif = _interopRequireDefault(require_gif());
    var _jsBinarySchemaParser = require_lib();
    var _uint = require_uint8();
    var _deinterlace = require_deinterlace();
    var _lzw = require_lzw();
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var parseGIF = function parseGIF(arrayBuffer) {
      var byteData = new Uint8Array(arrayBuffer);
      return (0, _jsBinarySchemaParser.parse)(
        (0, _uint.buildStream)(byteData),
        _gif["default"],
      );
    };
    exports.parseGIF = parseGIF;
    var generatePatch = function generatePatch(image) {
      var totalPixels = image.pixels.length;
      var patchData = new Uint8ClampedArray(totalPixels * 4);
      for (var i = 0; i < totalPixels; i++) {
        var pos = i * 4;
        var colorIndex = image.pixels[i];
        var color = image.colorTable[colorIndex] || [0, 0, 0];
        patchData[pos] = color[0];
        patchData[pos + 1] = color[1];
        patchData[pos + 2] = color[2];
        patchData[pos + 3] = colorIndex !== image.transparentIndex ? 255 : 0;
      }
      return patchData;
    };
    var decompressFrame = function decompressFrame(
      frame,
      gct,
      buildImagePatch,
    ) {
      if (!frame.image) {
        console.warn("gif frame does not have associated image.");
        return;
      }
      var image = frame.image;
      var totalPixels = image.descriptor.width * image.descriptor.height;
      var pixels = (0, _lzw.lzw)(
        image.data.minCodeSize,
        image.data.blocks,
        totalPixels,
      );
      if (image.descriptor.lct.interlaced) {
        pixels = (0, _deinterlace.deinterlace)(pixels, image.descriptor.width);
      }
      var resultImage = {
        pixels,
        dims: {
          top: frame.image.descriptor.top,
          left: frame.image.descriptor.left,
          width: frame.image.descriptor.width,
          height: frame.image.descriptor.height,
        },
      };
      if (image.descriptor.lct && image.descriptor.lct.exists) {
        resultImage.colorTable = image.lct;
      } else {
        resultImage.colorTable = gct;
      }
      if (frame.gce) {
        resultImage.delay = (frame.gce.delay || 10) * 10;
        resultImage.disposalType = frame.gce.extras.disposal;
        if (frame.gce.extras.transparentColorGiven) {
          resultImage.transparentIndex = frame.gce.transparentColorIndex;
        }
      }
      if (buildImagePatch) {
        resultImage.patch = generatePatch(resultImage);
      }
      return resultImage;
    };
    exports.decompressFrame = decompressFrame;
    var decompressFrames = function decompressFrames(
      parsedGif,
      buildImagePatches,
    ) {
      return parsedGif.frames
        .filter(function (f) {
          return f.image;
        })
        .map(function (f) {
          return decompressFrame(f, parsedGif.gct, buildImagePatches);
        });
    };
    exports.decompressFrames = decompressFrames;
  });

  // src/dev/main.ts
  var exports_main = {};
  __export(exports_main, {
    VirtualAdsSDK: () => VirtualAdsSDK,
  });

  // node_modules/twgl.js/dist/6.x/twgl-full.module.js
  var VecType = Float32Array;
  function create$1(x, y, z) {
    const dst = new VecType(3);
    if (x) {
      dst[0] = x;
    }
    if (y) {
      dst[1] = y;
    }
    if (z) {
      dst[2] = z;
    }
    return dst;
  }
  function add(a, b, dst) {
    dst = dst || new VecType(3);
    dst[0] = a[0] + b[0];
    dst[1] = a[1] + b[1];
    dst[2] = a[2] + b[2];
    return dst;
  }
  function multiply$1(a, b, dst) {
    dst = dst || new VecType(3);
    dst[0] = a[0] * b[0];
    dst[1] = a[1] * b[1];
    dst[2] = a[2] * b[2];
    return dst;
  }
  var MatType = Float32Array;
  function identity(dst) {
    dst = dst || new MatType(16);
    dst[0] = 1;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 0;
    dst[5] = 1;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 0;
    dst[9] = 0;
    dst[10] = 1;
    dst[11] = 0;
    dst[12] = 0;
    dst[13] = 0;
    dst[14] = 0;
    dst[15] = 1;
    return dst;
  }
  function inverse(m, dst) {
    dst = dst || new MatType(16);
    const m00 = m[0 * 4 + 0];
    const m01 = m[0 * 4 + 1];
    const m02 = m[0 * 4 + 2];
    const m03 = m[0 * 4 + 3];
    const m10 = m[1 * 4 + 0];
    const m11 = m[1 * 4 + 1];
    const m12 = m[1 * 4 + 2];
    const m13 = m[1 * 4 + 3];
    const m20 = m[2 * 4 + 0];
    const m21 = m[2 * 4 + 1];
    const m22 = m[2 * 4 + 2];
    const m23 = m[2 * 4 + 3];
    const m30 = m[3 * 4 + 0];
    const m31 = m[3 * 4 + 1];
    const m32 = m[3 * 4 + 2];
    const m33 = m[3 * 4 + 3];
    const tmp_0 = m22 * m33;
    const tmp_1 = m32 * m23;
    const tmp_2 = m12 * m33;
    const tmp_3 = m32 * m13;
    const tmp_4 = m12 * m23;
    const tmp_5 = m22 * m13;
    const tmp_6 = m02 * m33;
    const tmp_7 = m32 * m03;
    const tmp_8 = m02 * m23;
    const tmp_9 = m22 * m03;
    const tmp_10 = m02 * m13;
    const tmp_11 = m12 * m03;
    const tmp_12 = m20 * m31;
    const tmp_13 = m30 * m21;
    const tmp_14 = m10 * m31;
    const tmp_15 = m30 * m11;
    const tmp_16 = m10 * m21;
    const tmp_17 = m20 * m11;
    const tmp_18 = m00 * m31;
    const tmp_19 = m30 * m01;
    const tmp_20 = m00 * m21;
    const tmp_21 = m20 * m01;
    const tmp_22 = m00 * m11;
    const tmp_23 = m10 * m01;
    const t0 =
      tmp_0 * m11 +
      tmp_3 * m21 +
      tmp_4 * m31 -
      (tmp_1 * m11 + tmp_2 * m21 + tmp_5 * m31);
    const t1 =
      tmp_1 * m01 +
      tmp_6 * m21 +
      tmp_9 * m31 -
      (tmp_0 * m01 + tmp_7 * m21 + tmp_8 * m31);
    const t2 =
      tmp_2 * m01 +
      tmp_7 * m11 +
      tmp_10 * m31 -
      (tmp_3 * m01 + tmp_6 * m11 + tmp_11 * m31);
    const t3 =
      tmp_5 * m01 +
      tmp_8 * m11 +
      tmp_11 * m21 -
      (tmp_4 * m01 + tmp_9 * m11 + tmp_10 * m21);
    const d = 1 / (m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3);
    dst[0] = d * t0;
    dst[1] = d * t1;
    dst[2] = d * t2;
    dst[3] = d * t3;
    dst[4] =
      d *
      (tmp_1 * m10 +
        tmp_2 * m20 +
        tmp_5 * m30 -
        (tmp_0 * m10 + tmp_3 * m20 + tmp_4 * m30));
    dst[5] =
      d *
      (tmp_0 * m00 +
        tmp_7 * m20 +
        tmp_8 * m30 -
        (tmp_1 * m00 + tmp_6 * m20 + tmp_9 * m30));
    dst[6] =
      d *
      (tmp_3 * m00 +
        tmp_6 * m10 +
        tmp_11 * m30 -
        (tmp_2 * m00 + tmp_7 * m10 + tmp_10 * m30));
    dst[7] =
      d *
      (tmp_4 * m00 +
        tmp_9 * m10 +
        tmp_10 * m20 -
        (tmp_5 * m00 + tmp_8 * m10 + tmp_11 * m20));
    dst[8] =
      d *
      (tmp_12 * m13 +
        tmp_15 * m23 +
        tmp_16 * m33 -
        (tmp_13 * m13 + tmp_14 * m23 + tmp_17 * m33));
    dst[9] =
      d *
      (tmp_13 * m03 +
        tmp_18 * m23 +
        tmp_21 * m33 -
        (tmp_12 * m03 + tmp_19 * m23 + tmp_20 * m33));
    dst[10] =
      d *
      (tmp_14 * m03 +
        tmp_19 * m13 +
        tmp_22 * m33 -
        (tmp_15 * m03 + tmp_18 * m13 + tmp_23 * m33));
    dst[11] =
      d *
      (tmp_17 * m03 +
        tmp_20 * m13 +
        tmp_23 * m23 -
        (tmp_16 * m03 + tmp_21 * m13 + tmp_22 * m23));
    dst[12] =
      d *
      (tmp_14 * m22 +
        tmp_17 * m32 +
        tmp_13 * m12 -
        (tmp_16 * m32 + tmp_12 * m12 + tmp_15 * m22));
    dst[13] =
      d *
      (tmp_20 * m32 +
        tmp_12 * m02 +
        tmp_19 * m22 -
        (tmp_18 * m22 + tmp_21 * m32 + tmp_13 * m02));
    dst[14] =
      d *
      (tmp_18 * m12 +
        tmp_23 * m32 +
        tmp_15 * m02 -
        (tmp_22 * m32 + tmp_14 * m02 + tmp_19 * m12));
    dst[15] =
      d *
      (tmp_22 * m22 +
        tmp_16 * m02 +
        tmp_21 * m12 -
        (tmp_20 * m12 + tmp_23 * m22 + tmp_17 * m02));
    return dst;
  }
  function transformPoint(m, v, dst) {
    dst = dst || create$1();
    const v0 = v[0];
    const v1 = v[1];
    const v2 = v[2];
    const d =
      v0 * m[0 * 4 + 3] + v1 * m[1 * 4 + 3] + v2 * m[2 * 4 + 3] + m[3 * 4 + 3];
    dst[0] =
      (v0 * m[0 * 4 + 0] +
        v1 * m[1 * 4 + 0] +
        v2 * m[2 * 4 + 0] +
        m[3 * 4 + 0]) /
      d;
    dst[1] =
      (v0 * m[0 * 4 + 1] +
        v1 * m[1 * 4 + 1] +
        v2 * m[2 * 4 + 1] +
        m[3 * 4 + 1]) /
      d;
    dst[2] =
      (v0 * m[0 * 4 + 2] +
        v1 * m[1 * 4 + 2] +
        v2 * m[2 * 4 + 2] +
        m[3 * 4 + 2]) /
      d;
    return dst;
  }
  function transformDirection(m, v, dst) {
    dst = dst || create$1();
    const v0 = v[0];
    const v1 = v[1];
    const v2 = v[2];
    dst[0] = v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0];
    dst[1] = v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1];
    dst[2] = v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2];
    return dst;
  }
  var BYTE$2 = 5120;
  var UNSIGNED_BYTE$3 = 5121;
  var SHORT$2 = 5122;
  var UNSIGNED_SHORT$3 = 5123;
  var INT$3 = 5124;
  var UNSIGNED_INT$3 = 5125;
  var FLOAT$3 = 5126;
  var UNSIGNED_SHORT_4_4_4_4$1 = 32819;
  var UNSIGNED_SHORT_5_5_5_1$1 = 32820;
  var UNSIGNED_SHORT_5_6_5$1 = 33635;
  var HALF_FLOAT$1 = 5131;
  var UNSIGNED_INT_2_10_10_10_REV$1 = 33640;
  var UNSIGNED_INT_10F_11F_11F_REV$1 = 35899;
  var UNSIGNED_INT_5_9_9_9_REV$1 = 35902;
  var FLOAT_32_UNSIGNED_INT_24_8_REV$1 = 36269;
  var UNSIGNED_INT_24_8$1 = 34042;
  var glTypeToTypedArray = {};
  {
    const tt = glTypeToTypedArray;
    tt[BYTE$2] = Int8Array;
    tt[UNSIGNED_BYTE$3] = Uint8Array;
    tt[SHORT$2] = Int16Array;
    tt[UNSIGNED_SHORT$3] = Uint16Array;
    tt[INT$3] = Int32Array;
    tt[UNSIGNED_INT$3] = Uint32Array;
    tt[FLOAT$3] = Float32Array;
    tt[UNSIGNED_SHORT_4_4_4_4$1] = Uint16Array;
    tt[UNSIGNED_SHORT_5_5_5_1$1] = Uint16Array;
    tt[UNSIGNED_SHORT_5_6_5$1] = Uint16Array;
    tt[HALF_FLOAT$1] = Uint16Array;
    tt[UNSIGNED_INT_2_10_10_10_REV$1] = Uint32Array;
    tt[UNSIGNED_INT_10F_11F_11F_REV$1] = Uint32Array;
    tt[UNSIGNED_INT_5_9_9_9_REV$1] = Uint32Array;
    tt[FLOAT_32_UNSIGNED_INT_24_8_REV$1] = Uint32Array;
    tt[UNSIGNED_INT_24_8$1] = Uint32Array;
  }
  function getGLTypeForTypedArray(typedArray) {
    if (typedArray instanceof Int8Array) {
      return BYTE$2;
    }
    if (typedArray instanceof Uint8Array) {
      return UNSIGNED_BYTE$3;
    }
    if (typedArray instanceof Uint8ClampedArray) {
      return UNSIGNED_BYTE$3;
    }
    if (typedArray instanceof Int16Array) {
      return SHORT$2;
    }
    if (typedArray instanceof Uint16Array) {
      return UNSIGNED_SHORT$3;
    }
    if (typedArray instanceof Int32Array) {
      return INT$3;
    }
    if (typedArray instanceof Uint32Array) {
      return UNSIGNED_INT$3;
    }
    if (typedArray instanceof Float32Array) {
      return FLOAT$3;
    }
    throw new Error("unsupported typed array type");
  }
  function getGLTypeForTypedArrayType(typedArrayType) {
    if (typedArrayType === Int8Array) {
      return BYTE$2;
    }
    if (typedArrayType === Uint8Array) {
      return UNSIGNED_BYTE$3;
    }
    if (typedArrayType === Uint8ClampedArray) {
      return UNSIGNED_BYTE$3;
    }
    if (typedArrayType === Int16Array) {
      return SHORT$2;
    }
    if (typedArrayType === Uint16Array) {
      return UNSIGNED_SHORT$3;
    }
    if (typedArrayType === Int32Array) {
      return INT$3;
    }
    if (typedArrayType === Uint32Array) {
      return UNSIGNED_INT$3;
    }
    if (typedArrayType === Float32Array) {
      return FLOAT$3;
    }
    throw new Error("unsupported typed array type");
  }
  function getTypedArrayTypeForGLType(type) {
    const CTOR = glTypeToTypedArray[type];
    if (!CTOR) {
      throw new Error("unknown gl type");
    }
    return CTOR;
  }
  var isArrayBuffer$1 =
    typeof SharedArrayBuffer !== "undefined"
      ? function isArrayBufferOrSharedArrayBuffer(a) {
          return (
            a &&
            a.buffer &&
            (a.buffer instanceof ArrayBuffer ||
              a.buffer instanceof SharedArrayBuffer)
          );
        }
      : function isArrayBuffer(a) {
          return a && a.buffer && a.buffer instanceof ArrayBuffer;
        };
  function error$1(...args) {
    console.error(...args);
  }
  var isTypeWeakMaps = new Map();
  function isType(object, type) {
    if (!object || typeof object !== "object") {
      return false;
    }
    let weakMap = isTypeWeakMaps.get(type);
    if (!weakMap) {
      weakMap = new WeakMap();
      isTypeWeakMaps.set(type, weakMap);
    }
    let isOfType = weakMap.get(object);
    if (isOfType === undefined) {
      const s = Object.prototype.toString.call(object);
      isOfType = s.substring(8, s.length - 1) === type;
      weakMap.set(object, isOfType);
    }
    return isOfType;
  }
  function isBuffer(gl, t) {
    return typeof WebGLBuffer !== "undefined" && isType(t, "WebGLBuffer");
  }
  function isTexture(gl, t) {
    return typeof WebGLTexture !== "undefined" && isType(t, "WebGLTexture");
  }
  var STATIC_DRAW = 35044;
  var ARRAY_BUFFER$1 = 34962;
  var ELEMENT_ARRAY_BUFFER$2 = 34963;
  var BUFFER_SIZE = 34660;
  var BYTE$1 = 5120;
  var UNSIGNED_BYTE$2 = 5121;
  var SHORT$1 = 5122;
  var UNSIGNED_SHORT$2 = 5123;
  var INT$2 = 5124;
  var UNSIGNED_INT$2 = 5125;
  var FLOAT$2 = 5126;
  var defaults$2 = {
    attribPrefix: "",
  };
  function setBufferFromTypedArray(gl, type, buffer, array, drawType) {
    gl.bindBuffer(type, buffer);
    gl.bufferData(type, array, drawType || STATIC_DRAW);
  }
  function createBufferFromTypedArray(gl, typedArray, type, drawType) {
    if (isBuffer(gl, typedArray)) {
      return typedArray;
    }
    type = type || ARRAY_BUFFER$1;
    const buffer = gl.createBuffer();
    setBufferFromTypedArray(gl, type, buffer, typedArray, drawType);
    return buffer;
  }
  function isIndices(name) {
    return name === "indices";
  }
  function getNormalizationForTypedArrayType(typedArrayType) {
    if (typedArrayType === Int8Array) {
      return true;
    }
    if (typedArrayType === Uint8Array) {
      return true;
    }
    return false;
  }
  function getArray$1(array) {
    return array.length ? array : array.data;
  }
  var texcoordRE = /coord|texture/i;
  var colorRE = /color|colour/i;
  function guessNumComponentsFromName(name, length2) {
    let numComponents;
    if (texcoordRE.test(name)) {
      numComponents = 2;
    } else if (colorRE.test(name)) {
      numComponents = 4;
    } else {
      numComponents = 3;
    }
    if (length2 % numComponents > 0) {
      throw new Error(
        `Can not guess numComponents for attribute '${name}'. Tried ${numComponents} but ${length2} values is not evenly divisible by ${numComponents}. You should specify it.`,
      );
    }
    return numComponents;
  }
  function getNumComponents$1(array, arrayName, numValues) {
    return (
      array.numComponents ||
      array.size ||
      guessNumComponentsFromName(
        arrayName,
        numValues || getArray$1(array).length,
      )
    );
  }
  function makeTypedArray(array, name) {
    if (isArrayBuffer$1(array)) {
      return array;
    }
    if (isArrayBuffer$1(array.data)) {
      return array.data;
    }
    if (Array.isArray(array)) {
      array = {
        data: array,
      };
    }
    let Type = array.type
      ? typedArrayTypeFromGLTypeOrTypedArrayCtor(array.type)
      : undefined;
    if (!Type) {
      if (isIndices(name)) {
        Type = Uint16Array;
      } else {
        Type = Float32Array;
      }
    }
    return new Type(array.data);
  }
  function glTypeFromGLTypeOrTypedArrayType(glTypeOrTypedArrayCtor) {
    return typeof glTypeOrTypedArrayCtor === "number"
      ? glTypeOrTypedArrayCtor
      : glTypeOrTypedArrayCtor
        ? getGLTypeForTypedArrayType(glTypeOrTypedArrayCtor)
        : FLOAT$2;
  }
  function typedArrayTypeFromGLTypeOrTypedArrayCtor(glTypeOrTypedArrayCtor) {
    return typeof glTypeOrTypedArrayCtor === "number"
      ? getTypedArrayTypeForGLType(glTypeOrTypedArrayCtor)
      : glTypeOrTypedArrayCtor || Float32Array;
  }
  function attribBufferFromBuffer(gl, array) {
    return {
      buffer: array.buffer,
      numValues: 2 * 3 * 4,
      type: glTypeFromGLTypeOrTypedArrayType(array.type),
      arrayType: typedArrayTypeFromGLTypeOrTypedArrayCtor(array.type),
    };
  }
  function attribBufferFromSize(gl, array) {
    const numValues = array.data || array;
    const arrayType = typedArrayTypeFromGLTypeOrTypedArrayCtor(array.type);
    const numBytes = numValues * arrayType.BYTES_PER_ELEMENT;
    const buffer = gl.createBuffer();
    gl.bindBuffer(ARRAY_BUFFER$1, buffer);
    gl.bufferData(ARRAY_BUFFER$1, numBytes, array.drawType || STATIC_DRAW);
    return {
      buffer,
      numValues,
      type: getGLTypeForTypedArrayType(arrayType),
      arrayType,
    };
  }
  function attribBufferFromArrayLike(gl, array, arrayName) {
    const typedArray = makeTypedArray(array, arrayName);
    return {
      arrayType: typedArray.constructor,
      buffer: createBufferFromTypedArray(
        gl,
        typedArray,
        undefined,
        array.drawType,
      ),
      type: getGLTypeForTypedArray(typedArray),
      numValues: 0,
    };
  }
  function createAttribsFromArrays(gl, arrays) {
    const attribs = {};
    Object.keys(arrays).forEach(function (arrayName) {
      if (!isIndices(arrayName)) {
        const array = arrays[arrayName];
        const attribName =
          array.attrib ||
          array.name ||
          array.attribName ||
          defaults$2.attribPrefix + arrayName;
        if (array.value) {
          if (!Array.isArray(array.value) && !isArrayBuffer$1(array.value)) {
            throw new Error("array.value is not array or typedarray");
          }
          attribs[attribName] = {
            value: array.value,
          };
        } else {
          let fn;
          if (array.buffer && array.buffer instanceof WebGLBuffer) {
            fn = attribBufferFromBuffer;
          } else if (
            typeof array === "number" ||
            typeof array.data === "number"
          ) {
            fn = attribBufferFromSize;
          } else {
            fn = attribBufferFromArrayLike;
          }
          const { buffer, type, numValues, arrayType } = fn(
            gl,
            array,
            arrayName,
          );
          const normalization =
            array.normalize !== undefined
              ? array.normalize
              : getNormalizationForTypedArrayType(arrayType);
          const numComponents = getNumComponents$1(array, arrayName, numValues);
          attribs[attribName] = {
            buffer,
            numComponents,
            type,
            normalize: normalization,
            stride: array.stride || 0,
            offset: array.offset || 0,
            divisor: array.divisor === undefined ? undefined : array.divisor,
            drawType: array.drawType,
          };
        }
      }
    });
    gl.bindBuffer(ARRAY_BUFFER$1, null);
    return attribs;
  }
  function setAttribInfoBufferFromArray(gl, attribInfo, array, offset) {
    array = makeTypedArray(array);
    if (offset !== undefined) {
      gl.bindBuffer(ARRAY_BUFFER$1, attribInfo.buffer);
      gl.bufferSubData(ARRAY_BUFFER$1, offset, array);
    } else {
      setBufferFromTypedArray(
        gl,
        ARRAY_BUFFER$1,
        attribInfo.buffer,
        array,
        attribInfo.drawType,
      );
    }
  }
  function getBytesPerValueForGLType(gl, type) {
    if (type === BYTE$1) return 1;
    if (type === UNSIGNED_BYTE$2) return 1;
    if (type === SHORT$1) return 2;
    if (type === UNSIGNED_SHORT$2) return 2;
    if (type === INT$2) return 4;
    if (type === UNSIGNED_INT$2) return 4;
    if (type === FLOAT$2) return 4;
    return 0;
  }
  var positionKeys = ["position", "positions", "a_position"];
  function getNumElementsFromNonIndexedArrays(arrays) {
    let key;
    let ii;
    for (ii = 0; ii < positionKeys.length; ++ii) {
      key = positionKeys[ii];
      if (key in arrays) {
        break;
      }
    }
    if (ii === positionKeys.length) {
      key = Object.keys(arrays)[0];
    }
    const array = arrays[key];
    const length2 = getArray$1(array).length;
    if (length2 === undefined) {
      return 1;
    }
    const numComponents = getNumComponents$1(array, key);
    const numElements = length2 / numComponents;
    if (length2 % numComponents > 0) {
      throw new Error(
        `numComponents ${numComponents} not correct for length ${length2}`,
      );
    }
    return numElements;
  }
  function getNumElementsFromAttributes(gl, attribs) {
    let key;
    let ii;
    for (ii = 0; ii < positionKeys.length; ++ii) {
      key = positionKeys[ii];
      if (key in attribs) {
        break;
      }
      key = defaults$2.attribPrefix + key;
      if (key in attribs) {
        break;
      }
    }
    if (ii === positionKeys.length) {
      key = Object.keys(attribs)[0];
    }
    const attrib = attribs[key];
    if (!attrib.buffer) {
      return 1;
    }
    gl.bindBuffer(ARRAY_BUFFER$1, attrib.buffer);
    const numBytes = gl.getBufferParameter(ARRAY_BUFFER$1, BUFFER_SIZE);
    gl.bindBuffer(ARRAY_BUFFER$1, null);
    const bytesPerValue = getBytesPerValueForGLType(gl, attrib.type);
    const totalElements = numBytes / bytesPerValue;
    const numComponents = attrib.numComponents || attrib.size;
    const numElements = totalElements / numComponents;
    if (numElements % 1 !== 0) {
      throw new Error(
        `numComponents ${numComponents} not correct for length ${length}`,
      );
    }
    return numElements;
  }
  function createBufferInfoFromArrays(gl, arrays, srcBufferInfo) {
    const newAttribs = createAttribsFromArrays(gl, arrays);
    const bufferInfo = Object.assign({}, srcBufferInfo ? srcBufferInfo : {});
    bufferInfo.attribs = Object.assign(
      {},
      srcBufferInfo ? srcBufferInfo.attribs : {},
      newAttribs,
    );
    const indices = arrays.indices;
    if (indices) {
      const newIndices = makeTypedArray(indices, "indices");
      bufferInfo.indices = createBufferFromTypedArray(
        gl,
        newIndices,
        ELEMENT_ARRAY_BUFFER$2,
      );
      bufferInfo.numElements = newIndices.length;
      bufferInfo.elementType = getGLTypeForTypedArray(newIndices);
    } else if (!bufferInfo.numElements) {
      bufferInfo.numElements = getNumElementsFromAttributes(
        gl,
        bufferInfo.attribs,
      );
    }
    return bufferInfo;
  }
  function createBufferFromArray(gl, array, arrayName) {
    const type =
      arrayName === "indices" ? ELEMENT_ARRAY_BUFFER$2 : ARRAY_BUFFER$1;
    const typedArray = makeTypedArray(array, arrayName);
    return createBufferFromTypedArray(gl, typedArray, type);
  }
  function createBuffersFromArrays(gl, arrays) {
    const buffers = {};
    Object.keys(arrays).forEach(function (key) {
      buffers[key] = createBufferFromArray(gl, arrays[key], key);
    });
    if (arrays.indices) {
      buffers.numElements = arrays.indices.length;
      buffers.elementType = getGLTypeForTypedArray(
        makeTypedArray(arrays.indices),
      );
    } else {
      buffers.numElements = getNumElementsFromNonIndexedArrays(arrays);
    }
    return buffers;
  }
  function augmentTypedArray(typedArray, numComponents) {
    let cursor = 0;
    typedArray.push = function () {
      for (let ii = 0; ii < arguments.length; ++ii) {
        const value = arguments[ii];
        if (value instanceof Array || isArrayBuffer$1(value)) {
          for (let jj = 0; jj < value.length; ++jj) {
            typedArray[cursor++] = value[jj];
          }
        } else {
          typedArray[cursor++] = value;
        }
      }
    };
    typedArray.reset = function (opt_index) {
      cursor = opt_index || 0;
    };
    typedArray.numComponents = numComponents;
    Object.defineProperty(typedArray, "numElements", {
      get: function () {
        return (this.length / this.numComponents) | 0;
      },
    });
    return typedArray;
  }
  function createAugmentedTypedArray(numComponents, numElements, opt_type) {
    const Type = opt_type || Float32Array;
    return augmentTypedArray(
      new Type(numComponents * numElements),
      numComponents,
    );
  }
  function applyFuncToV3Array(array, matrix, fn) {
    const len = array.length;
    const tmp = new Float32Array(3);
    for (let ii = 0; ii < len; ii += 3) {
      fn(matrix, [array[ii], array[ii + 1], array[ii + 2]], tmp);
      array[ii] = tmp[0];
      array[ii + 1] = tmp[1];
      array[ii + 2] = tmp[2];
    }
  }
  function transformNormal(mi, v, dst) {
    dst = dst || create$1();
    const v0 = v[0];
    const v1 = v[1];
    const v2 = v[2];
    dst[0] = v0 * mi[0 * 4 + 0] + v1 * mi[0 * 4 + 1] + v2 * mi[0 * 4 + 2];
    dst[1] = v0 * mi[1 * 4 + 0] + v1 * mi[1 * 4 + 1] + v2 * mi[1 * 4 + 2];
    dst[2] = v0 * mi[2 * 4 + 0] + v1 * mi[2 * 4 + 1] + v2 * mi[2 * 4 + 2];
    return dst;
  }
  function reorientDirections(array, matrix) {
    applyFuncToV3Array(array, matrix, transformDirection);
    return array;
  }
  function reorientNormals(array, matrix) {
    applyFuncToV3Array(array, inverse(matrix), transformNormal);
    return array;
  }
  function reorientPositions(array, matrix) {
    applyFuncToV3Array(array, matrix, transformPoint);
    return array;
  }
  function reorientVertices(arrays, matrix) {
    Object.keys(arrays).forEach(function (name) {
      const array = arrays[name];
      if (name.indexOf("pos") >= 0) {
        reorientPositions(array, matrix);
      } else if (name.indexOf("tan") >= 0 || name.indexOf("binorm") >= 0) {
        reorientDirections(array, matrix);
      } else if (name.indexOf("norm") >= 0) {
        reorientNormals(array, matrix);
      }
    });
    return arrays;
  }
  function createXYQuadVertices(size, xOffset, yOffset) {
    size = size || 2;
    xOffset = xOffset || 0;
    yOffset = yOffset || 0;
    size *= 0.5;
    return {
      position: {
        numComponents: 2,
        data: [
          xOffset + -1 * size,
          yOffset + -1 * size,
          xOffset + 1 * size,
          yOffset + -1 * size,
          xOffset + -1 * size,
          yOffset + 1 * size,
          xOffset + 1 * size,
          yOffset + 1 * size,
        ],
      },
      normal: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      texcoord: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 2, 2, 1, 3],
    };
  }
  function createPlaneVertices(
    width,
    depth,
    subdivisionsWidth,
    subdivisionsDepth,
    matrix,
  ) {
    width = width || 1;
    depth = depth || 1;
    subdivisionsWidth = subdivisionsWidth || 1;
    subdivisionsDepth = subdivisionsDepth || 1;
    matrix = matrix || identity();
    const numVertices = (subdivisionsWidth + 1) * (subdivisionsDepth + 1);
    const positions = createAugmentedTypedArray(3, numVertices);
    const normals = createAugmentedTypedArray(3, numVertices);
    const texcoords = createAugmentedTypedArray(2, numVertices);
    for (let z = 0; z <= subdivisionsDepth; z++) {
      for (let x = 0; x <= subdivisionsWidth; x++) {
        const u = x / subdivisionsWidth;
        const v = z / subdivisionsDepth;
        positions.push(width * u - width * 0.5, 0, depth * v - depth * 0.5);
        normals.push(0, 1, 0);
        texcoords.push(u, v);
      }
    }
    const numVertsAcross = subdivisionsWidth + 1;
    const indices = createAugmentedTypedArray(
      3,
      subdivisionsWidth * subdivisionsDepth * 2,
      Uint16Array,
    );
    for (let z = 0; z < subdivisionsDepth; z++) {
      for (let x = 0; x < subdivisionsWidth; x++) {
        indices.push(
          (z + 0) * numVertsAcross + x,
          (z + 1) * numVertsAcross + x,
          (z + 0) * numVertsAcross + x + 1,
        );
        indices.push(
          (z + 1) * numVertsAcross + x,
          (z + 1) * numVertsAcross + x + 1,
          (z + 0) * numVertsAcross + x + 1,
        );
      }
    }
    const arrays = reorientVertices(
      {
        position: positions,
        normal: normals,
        texcoord: texcoords,
        indices,
      },
      matrix,
    );
    return arrays;
  }
  function createSphereVertices(
    radius,
    subdivisionsAxis,
    subdivisionsHeight,
    opt_startLatitudeInRadians,
    opt_endLatitudeInRadians,
    opt_startLongitudeInRadians,
    opt_endLongitudeInRadians,
  ) {
    if (subdivisionsAxis <= 0 || subdivisionsHeight <= 0) {
      throw new Error("subdivisionAxis and subdivisionHeight must be > 0");
    }
    opt_startLatitudeInRadians = opt_startLatitudeInRadians || 0;
    opt_endLatitudeInRadians = opt_endLatitudeInRadians || Math.PI;
    opt_startLongitudeInRadians = opt_startLongitudeInRadians || 0;
    opt_endLongitudeInRadians = opt_endLongitudeInRadians || Math.PI * 2;
    const latRange = opt_endLatitudeInRadians - opt_startLatitudeInRadians;
    const longRange = opt_endLongitudeInRadians - opt_startLongitudeInRadians;
    const numVertices = (subdivisionsAxis + 1) * (subdivisionsHeight + 1);
    const positions = createAugmentedTypedArray(3, numVertices);
    const normals = createAugmentedTypedArray(3, numVertices);
    const texcoords = createAugmentedTypedArray(2, numVertices);
    for (let y = 0; y <= subdivisionsHeight; y++) {
      for (let x = 0; x <= subdivisionsAxis; x++) {
        const u = x / subdivisionsAxis;
        const v = y / subdivisionsHeight;
        const theta = longRange * u + opt_startLongitudeInRadians;
        const phi = latRange * v + opt_startLatitudeInRadians;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const ux = cosTheta * sinPhi;
        const uy = cosPhi;
        const uz = sinTheta * sinPhi;
        positions.push(radius * ux, radius * uy, radius * uz);
        normals.push(ux, uy, uz);
        texcoords.push(1 - u, v);
      }
    }
    const numVertsAround = subdivisionsAxis + 1;
    const indices = createAugmentedTypedArray(
      3,
      subdivisionsAxis * subdivisionsHeight * 2,
      Uint16Array,
    );
    for (let x = 0; x < subdivisionsAxis; x++) {
      for (let y = 0; y < subdivisionsHeight; y++) {
        indices.push(
          (y + 0) * numVertsAround + x,
          (y + 0) * numVertsAround + x + 1,
          (y + 1) * numVertsAround + x,
        );
        indices.push(
          (y + 1) * numVertsAround + x,
          (y + 0) * numVertsAround + x + 1,
          (y + 1) * numVertsAround + x + 1,
        );
      }
    }
    return {
      position: positions,
      normal: normals,
      texcoord: texcoords,
      indices,
    };
  }
  var CUBE_FACE_INDICES = [
    [3, 7, 5, 1],
    [6, 2, 0, 4],
    [6, 7, 3, 2],
    [0, 1, 5, 4],
    [7, 6, 4, 5],
    [2, 3, 1, 0],
  ];
  function createCubeVertices(size) {
    size = size || 1;
    const k = size / 2;
    const cornerVertices = [
      [-k, -k, -k],
      [+k, -k, -k],
      [-k, +k, -k],
      [+k, +k, -k],
      [-k, -k, +k],
      [+k, -k, +k],
      [-k, +k, +k],
      [+k, +k, +k],
    ];
    const faceNormals = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    const uvCoords = [
      [1, 0],
      [0, 0],
      [0, 1],
      [1, 1],
    ];
    const numVertices = 6 * 4;
    const positions = createAugmentedTypedArray(3, numVertices);
    const normals = createAugmentedTypedArray(3, numVertices);
    const texcoords = createAugmentedTypedArray(2, numVertices);
    const indices = createAugmentedTypedArray(3, 6 * 2, Uint16Array);
    for (let f = 0; f < 6; ++f) {
      const faceIndices = CUBE_FACE_INDICES[f];
      for (let v = 0; v < 4; ++v) {
        const position = cornerVertices[faceIndices[v]];
        const normal = faceNormals[f];
        const uv = uvCoords[v];
        positions.push(position);
        normals.push(normal);
        texcoords.push(uv);
      }
      const offset = 4 * f;
      indices.push(offset + 0, offset + 1, offset + 2);
      indices.push(offset + 0, offset + 2, offset + 3);
    }
    return {
      position: positions,
      normal: normals,
      texcoord: texcoords,
      indices,
    };
  }
  function createTruncatedConeVertices(
    bottomRadius,
    topRadius,
    height,
    radialSubdivisions,
    verticalSubdivisions,
    opt_topCap,
    opt_bottomCap,
  ) {
    if (radialSubdivisions < 3) {
      throw new Error("radialSubdivisions must be 3 or greater");
    }
    if (verticalSubdivisions < 1) {
      throw new Error("verticalSubdivisions must be 1 or greater");
    }
    const topCap = opt_topCap === undefined ? true : opt_topCap;
    const bottomCap = opt_bottomCap === undefined ? true : opt_bottomCap;
    const extra = (topCap ? 2 : 0) + (bottomCap ? 2 : 0);
    const numVertices =
      (radialSubdivisions + 1) * (verticalSubdivisions + 1 + extra);
    const positions = createAugmentedTypedArray(3, numVertices);
    const normals = createAugmentedTypedArray(3, numVertices);
    const texcoords = createAugmentedTypedArray(2, numVertices);
    const indices = createAugmentedTypedArray(
      3,
      radialSubdivisions * (verticalSubdivisions + extra / 2) * 2,
      Uint16Array,
    );
    const vertsAroundEdge = radialSubdivisions + 1;
    const slant = Math.atan2(bottomRadius - topRadius, height);
    const cosSlant = Math.cos(slant);
    const sinSlant = Math.sin(slant);
    const start = topCap ? -2 : 0;
    const end = verticalSubdivisions + (bottomCap ? 2 : 0);
    for (let yy = start; yy <= end; ++yy) {
      let v = yy / verticalSubdivisions;
      let y = height * v;
      let ringRadius;
      if (yy < 0) {
        y = 0;
        v = 1;
        ringRadius = bottomRadius;
      } else if (yy > verticalSubdivisions) {
        y = height;
        v = 1;
        ringRadius = topRadius;
      } else {
        ringRadius =
          bottomRadius +
          (topRadius - bottomRadius) * (yy / verticalSubdivisions);
      }
      if (yy === -2 || yy === verticalSubdivisions + 2) {
        ringRadius = 0;
        v = 0;
      }
      y -= height / 2;
      for (let ii = 0; ii < vertsAroundEdge; ++ii) {
        const sin = Math.sin((ii * Math.PI * 2) / radialSubdivisions);
        const cos = Math.cos((ii * Math.PI * 2) / radialSubdivisions);
        positions.push(sin * ringRadius, y, cos * ringRadius);
        if (yy < 0) {
          normals.push(0, -1, 0);
        } else if (yy > verticalSubdivisions) {
          normals.push(0, 1, 0);
        } else if (ringRadius === 0) {
          normals.push(0, 0, 0);
        } else {
          normals.push(sin * cosSlant, sinSlant, cos * cosSlant);
        }
        texcoords.push(ii / radialSubdivisions, 1 - v);
      }
    }
    for (let yy = 0; yy < verticalSubdivisions + extra; ++yy) {
      if (
        (yy === 1 && topCap) ||
        (yy === verticalSubdivisions + extra - 2 && bottomCap)
      ) {
        continue;
      }
      for (let ii = 0; ii < radialSubdivisions; ++ii) {
        indices.push(
          vertsAroundEdge * (yy + 0) + 0 + ii,
          vertsAroundEdge * (yy + 0) + 1 + ii,
          vertsAroundEdge * (yy + 1) + 1 + ii,
        );
        indices.push(
          vertsAroundEdge * (yy + 0) + 0 + ii,
          vertsAroundEdge * (yy + 1) + 1 + ii,
          vertsAroundEdge * (yy + 1) + 0 + ii,
        );
      }
    }
    return {
      position: positions,
      normal: normals,
      texcoord: texcoords,
      indices,
    };
  }
  function expandRLEData(rleData, padding) {
    padding = padding || [];
    const data = [];
    for (let ii = 0; ii < rleData.length; ii += 4) {
      const runLength = rleData[ii];
      const element = rleData.slice(ii + 1, ii + 4);
      element.push.apply(element, padding);
      for (let jj = 0; jj < runLength; ++jj) {
        data.push.apply(data, element);
      }
    }
    return data;
  }
  function create3DFVertices() {
    const positions = [
      0, 0, 0, 0, 150, 0, 30, 0, 0, 0, 150, 0, 30, 150, 0, 30, 0, 0, 30, 0, 0,
      30, 30, 0, 100, 0, 0, 30, 30, 0, 100, 30, 0, 100, 0, 0, 30, 60, 0, 30, 90,
      0, 67, 60, 0, 30, 90, 0, 67, 90, 0, 67, 60, 0, 0, 0, 30, 30, 0, 30, 0,
      150, 30, 0, 150, 30, 30, 0, 30, 30, 150, 30, 30, 0, 30, 100, 0, 30, 30,
      30, 30, 30, 30, 30, 100, 0, 30, 100, 30, 30, 30, 60, 30, 67, 60, 30, 30,
      90, 30, 30, 90, 30, 67, 60, 30, 67, 90, 30, 0, 0, 0, 100, 0, 0, 100, 0,
      30, 0, 0, 0, 100, 0, 30, 0, 0, 30, 100, 0, 0, 100, 30, 0, 100, 30, 30,
      100, 0, 0, 100, 30, 30, 100, 0, 30, 30, 30, 0, 30, 30, 30, 100, 30, 30,
      30, 30, 0, 100, 30, 30, 100, 30, 0, 30, 30, 0, 30, 60, 30, 30, 30, 30, 30,
      30, 0, 30, 60, 0, 30, 60, 30, 30, 60, 0, 67, 60, 30, 30, 60, 30, 30, 60,
      0, 67, 60, 0, 67, 60, 30, 67, 60, 0, 67, 90, 30, 67, 60, 30, 67, 60, 0,
      67, 90, 0, 67, 90, 30, 30, 90, 0, 30, 90, 30, 67, 90, 30, 30, 90, 0, 67,
      90, 30, 67, 90, 0, 30, 90, 0, 30, 150, 30, 30, 90, 30, 30, 90, 0, 30, 150,
      0, 30, 150, 30, 0, 150, 0, 0, 150, 30, 30, 150, 30, 0, 150, 0, 30, 150,
      30, 30, 150, 0, 0, 0, 0, 0, 0, 30, 0, 150, 30, 0, 0, 0, 0, 150, 30, 0,
      150, 0,
    ];
    const texcoords = [
      0.22, 0.19, 0.22, 0.79, 0.34, 0.19, 0.22, 0.79, 0.34, 0.79, 0.34, 0.19,
      0.34, 0.19, 0.34, 0.31, 0.62, 0.19, 0.34, 0.31, 0.62, 0.31, 0.62, 0.19,
      0.34, 0.43, 0.34, 0.55, 0.49, 0.43, 0.34, 0.55, 0.49, 0.55, 0.49, 0.43, 0,
      0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0,
      1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
      0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1,
      0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0,
      1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0,
      0, 1, 1, 1, 0,
    ];
    const normals = expandRLEData([
      18, 0, 0, 1, 18, 0, 0, -1, 6, 0, 1, 0, 6, 1, 0, 0, 6, 0, -1, 0, 6, 1, 0,
      0, 6, 0, 1, 0, 6, 1, 0, 0, 6, 0, -1, 0, 6, 1, 0, 0, 6, 0, -1, 0, 6, -1, 0,
      0,
    ]);
    const colors = expandRLEData(
      [
        18, 200, 70, 120, 18, 80, 70, 200, 6, 70, 200, 210, 6, 200, 200, 70, 6,
        210, 100, 70, 6, 210, 160, 70, 6, 70, 180, 210, 6, 100, 70, 210, 6, 76,
        210, 100, 6, 140, 210, 80, 6, 90, 130, 110, 6, 160, 160, 220,
      ],
      [255],
    );
    const numVerts = positions.length / 3;
    const arrays = {
      position: createAugmentedTypedArray(3, numVerts),
      texcoord: createAugmentedTypedArray(2, numVerts),
      normal: createAugmentedTypedArray(3, numVerts),
      color: createAugmentedTypedArray(4, numVerts, Uint8Array),
      indices: createAugmentedTypedArray(3, numVerts / 3, Uint16Array),
    };
    arrays.position.push(positions);
    arrays.texcoord.push(texcoords);
    arrays.normal.push(normals);
    arrays.color.push(colors);
    for (let ii = 0; ii < numVerts; ++ii) {
      arrays.indices.push(ii);
    }
    return arrays;
  }
  function createCrescentVertices(
    verticalRadius,
    outerRadius,
    innerRadius,
    thickness,
    subdivisionsDown,
    startOffset,
    endOffset,
  ) {
    if (subdivisionsDown <= 0) {
      throw new Error("subdivisionDown must be > 0");
    }
    startOffset = startOffset || 0;
    endOffset = endOffset || 1;
    const subdivisionsThick = 2;
    const offsetRange = endOffset - startOffset;
    const numVertices = (subdivisionsDown + 1) * 2 * (2 + subdivisionsThick);
    const positions = createAugmentedTypedArray(3, numVertices);
    const normals = createAugmentedTypedArray(3, numVertices);
    const texcoords = createAugmentedTypedArray(2, numVertices);
    function lerp(a, b, s) {
      return a + (b - a) * s;
    }
    function createArc(arcRadius, x, normalMult, normalAdd, uMult, uAdd) {
      for (let z = 0; z <= subdivisionsDown; z++) {
        const uBack = x / (subdivisionsThick - 1);
        const v = z / subdivisionsDown;
        const xBack = (uBack - 0.5) * 2;
        const angle = (startOffset + v * offsetRange) * Math.PI;
        const s = Math.sin(angle);
        const c = Math.cos(angle);
        const radius = lerp(verticalRadius, arcRadius, s);
        const px = xBack * thickness;
        const py = c * verticalRadius;
        const pz = s * radius;
        positions.push(px, py, pz);
        const n = add(multiply$1([0, s, c], normalMult), normalAdd);
        normals.push(n);
        texcoords.push(uBack * uMult + uAdd, v);
      }
    }
    for (let x = 0; x < subdivisionsThick; x++) {
      const uBack = (x / (subdivisionsThick - 1) - 0.5) * 2;
      createArc(outerRadius, x, [1, 1, 1], [0, 0, 0], 1, 0);
      createArc(outerRadius, x, [0, 0, 0], [uBack, 0, 0], 0, 0);
      createArc(innerRadius, x, [1, 1, 1], [0, 0, 0], 1, 0);
      createArc(innerRadius, x, [0, 0, 0], [uBack, 0, 0], 0, 1);
    }
    const indices = createAugmentedTypedArray(
      3,
      subdivisionsDown * 2 * (2 + subdivisionsThick),
      Uint16Array,
    );
    function createSurface(leftArcOffset, rightArcOffset) {
      for (let z = 0; z < subdivisionsDown; ++z) {
        indices.push(
          leftArcOffset + z + 0,
          leftArcOffset + z + 1,
          rightArcOffset + z + 0,
        );
        indices.push(
          leftArcOffset + z + 1,
          rightArcOffset + z + 1,
          rightArcOffset + z + 0,
        );
      }
    }
    const numVerticesDown = subdivisionsDown + 1;
    createSurface(numVerticesDown * 0, numVerticesDown * 4);
    createSurface(numVerticesDown * 5, numVerticesDown * 7);
    createSurface(numVerticesDown * 6, numVerticesDown * 2);
    createSurface(numVerticesDown * 3, numVerticesDown * 1);
    return {
      position: positions,
      normal: normals,
      texcoord: texcoords,
      indices,
    };
  }
  function createCylinderVertices(
    radius,
    height,
    radialSubdivisions,
    verticalSubdivisions,
    topCap,
    bottomCap,
  ) {
    return createTruncatedConeVertices(
      radius,
      radius,
      height,
      radialSubdivisions,
      verticalSubdivisions,
      topCap,
      bottomCap,
    );
  }
  function createTorusVertices(
    radius,
    thickness,
    radialSubdivisions,
    bodySubdivisions,
    startAngle,
    endAngle,
  ) {
    if (radialSubdivisions < 3) {
      throw new Error("radialSubdivisions must be 3 or greater");
    }
    if (bodySubdivisions < 3) {
      throw new Error("verticalSubdivisions must be 3 or greater");
    }
    startAngle = startAngle || 0;
    endAngle = endAngle || Math.PI * 2;
    const range = endAngle - startAngle;
    const radialParts = radialSubdivisions + 1;
    const bodyParts = bodySubdivisions + 1;
    const numVertices = radialParts * bodyParts;
    const positions = createAugmentedTypedArray(3, numVertices);
    const normals = createAugmentedTypedArray(3, numVertices);
    const texcoords = createAugmentedTypedArray(2, numVertices);
    const indices = createAugmentedTypedArray(
      3,
      radialSubdivisions * bodySubdivisions * 2,
      Uint16Array,
    );
    for (let slice = 0; slice < bodyParts; ++slice) {
      const v = slice / bodySubdivisions;
      const sliceAngle = v * Math.PI * 2;
      const sliceSin = Math.sin(sliceAngle);
      const ringRadius = radius + sliceSin * thickness;
      const ny = Math.cos(sliceAngle);
      const y = ny * thickness;
      for (let ring = 0; ring < radialParts; ++ring) {
        const u = ring / radialSubdivisions;
        const ringAngle = startAngle + u * range;
        const xSin = Math.sin(ringAngle);
        const zCos = Math.cos(ringAngle);
        const x = xSin * ringRadius;
        const z = zCos * ringRadius;
        const nx = xSin * sliceSin;
        const nz = zCos * sliceSin;
        positions.push(x, y, z);
        normals.push(nx, ny, nz);
        texcoords.push(u, 1 - v);
      }
    }
    for (let slice = 0; slice < bodySubdivisions; ++slice) {
      for (let ring = 0; ring < radialSubdivisions; ++ring) {
        const nextRingIndex = 1 + ring;
        const nextSliceIndex = 1 + slice;
        indices.push(
          radialParts * slice + ring,
          radialParts * nextSliceIndex + ring,
          radialParts * slice + nextRingIndex,
        );
        indices.push(
          radialParts * nextSliceIndex + ring,
          radialParts * nextSliceIndex + nextRingIndex,
          radialParts * slice + nextRingIndex,
        );
      }
    }
    return {
      position: positions,
      normal: normals,
      texcoord: texcoords,
      indices,
    };
  }
  function createDiscVertices(
    radius,
    divisions,
    stacks,
    innerRadius,
    stackPower,
  ) {
    if (divisions < 3) {
      throw new Error("divisions must be at least 3");
    }
    stacks = stacks ? stacks : 1;
    stackPower = stackPower ? stackPower : 1;
    innerRadius = innerRadius ? innerRadius : 0;
    const numVertices = (divisions + 1) * (stacks + 1);
    const positions = createAugmentedTypedArray(3, numVertices);
    const normals = createAugmentedTypedArray(3, numVertices);
    const texcoords = createAugmentedTypedArray(2, numVertices);
    const indices = createAugmentedTypedArray(
      3,
      stacks * divisions * 2,
      Uint16Array,
    );
    let firstIndex = 0;
    const radiusSpan = radius - innerRadius;
    const pointsPerStack = divisions + 1;
    for (let stack = 0; stack <= stacks; ++stack) {
      const stackRadius =
        innerRadius + radiusSpan * Math.pow(stack / stacks, stackPower);
      for (let i = 0; i <= divisions; ++i) {
        const theta = (2 * Math.PI * i) / divisions;
        const x = stackRadius * Math.cos(theta);
        const z = stackRadius * Math.sin(theta);
        positions.push(x, 0, z);
        normals.push(0, 1, 0);
        texcoords.push(1 - i / divisions, stack / stacks);
        if (stack > 0 && i !== divisions) {
          const a = firstIndex + (i + 1);
          const b = firstIndex + i;
          const c = firstIndex + i - pointsPerStack;
          const d = firstIndex + (i + 1) - pointsPerStack;
          indices.push(a, b, c);
          indices.push(a, c, d);
        }
      }
      firstIndex += divisions + 1;
    }
    return {
      position: positions,
      normal: normals,
      texcoord: texcoords,
      indices,
    };
  }
  function createBufferFunc(fn) {
    return function (gl) {
      const arrays = fn.apply(this, Array.prototype.slice.call(arguments, 1));
      return createBuffersFromArrays(gl, arrays);
    };
  }
  function createBufferInfoFunc(fn) {
    return function (gl) {
      const arrays = fn.apply(null, Array.prototype.slice.call(arguments, 1));
      return createBufferInfoFromArrays(gl, arrays);
    };
  }
  var create3DFBufferInfo = createBufferInfoFunc(create3DFVertices);
  var create3DFBuffers = createBufferFunc(create3DFVertices);
  var createCubeBufferInfo = createBufferInfoFunc(createCubeVertices);
  var createCubeBuffers = createBufferFunc(createCubeVertices);
  var createPlaneBufferInfo = createBufferInfoFunc(createPlaneVertices);
  var createPlaneBuffers = createBufferFunc(createPlaneVertices);
  var createSphereBufferInfo = createBufferInfoFunc(createSphereVertices);
  var createSphereBuffers = createBufferFunc(createSphereVertices);
  var createTruncatedConeBufferInfo = createBufferInfoFunc(
    createTruncatedConeVertices,
  );
  var createTruncatedConeBuffers = createBufferFunc(
    createTruncatedConeVertices,
  );
  var createXYQuadBufferInfo = createBufferInfoFunc(createXYQuadVertices);
  var createXYQuadBuffers = createBufferFunc(createXYQuadVertices);
  var createCrescentBufferInfo = createBufferInfoFunc(createCrescentVertices);
  var createCrescentBuffers = createBufferFunc(createCrescentVertices);
  var createCylinderBufferInfo = createBufferInfoFunc(createCylinderVertices);
  var createCylinderBuffers = createBufferFunc(createCylinderVertices);
  var createTorusBufferInfo = createBufferInfoFunc(createTorusVertices);
  var createTorusBuffers = createBufferFunc(createTorusVertices);
  var createDiscBufferInfo = createBufferInfoFunc(createDiscVertices);
  var createDiscBuffers = createBufferFunc(createDiscVertices);
  function isWebGL2(gl) {
    return !!gl.texStorage2D;
  }
  var glEnumToString = (function () {
    const haveEnumsForType = {};
    const enums = {};
    function addEnums(gl) {
      const type = gl.constructor.name;
      if (!haveEnumsForType[type]) {
        for (const key in gl) {
          if (typeof gl[key] === "number") {
            const existing = enums[gl[key]];
            enums[gl[key]] = existing ? `${existing} | ${key}` : key;
          }
        }
        haveEnumsForType[type] = true;
      }
    }
    return function glEnumToString(gl, value) {
      addEnums(gl);
      return (
        enums[value] ||
        (typeof value === "number" ? `0x${value.toString(16)}` : value)
      );
    };
  })();
  var defaults$1 = {
    textureColor: new Uint8Array([128, 192, 255, 255]),
    textureOptions: {},
    crossOrigin: undefined,
  };
  var getShared2DContext = (function () {
    let s_ctx;
    return function getShared2DContext() {
      s_ctx =
        s_ctx ||
        (typeof document !== "undefined" && document.createElement
          ? document.createElement("canvas").getContext("2d")
          : null);
      return s_ctx;
    };
  })();
  var ALPHA = 6406;
  var RGB = 6407;
  var RGBA$1 = 6408;
  var LUMINANCE = 6409;
  var LUMINANCE_ALPHA = 6410;
  var DEPTH_COMPONENT$1 = 6402;
  var DEPTH_STENCIL$1 = 34041;
  var RG = 33319;
  var RG_INTEGER = 33320;
  var RED = 6403;
  var RED_INTEGER = 36244;
  var RGB_INTEGER = 36248;
  var RGBA_INTEGER = 36249;
  var formatInfo = {};
  {
    const f = formatInfo;
    f[ALPHA] = { numColorComponents: 1 };
    f[LUMINANCE] = { numColorComponents: 1 };
    f[LUMINANCE_ALPHA] = { numColorComponents: 2 };
    f[RGB] = { numColorComponents: 3 };
    f[RGBA$1] = { numColorComponents: 4 };
    f[RED] = { numColorComponents: 1 };
    f[RED_INTEGER] = { numColorComponents: 1 };
    f[RG] = { numColorComponents: 2 };
    f[RG_INTEGER] = { numColorComponents: 2 };
    f[RGB] = { numColorComponents: 3 };
    f[RGB_INTEGER] = { numColorComponents: 3 };
    f[RGBA$1] = { numColorComponents: 4 };
    f[RGBA_INTEGER] = { numColorComponents: 4 };
    f[DEPTH_COMPONENT$1] = { numColorComponents: 1 };
    f[DEPTH_STENCIL$1] = { numColorComponents: 2 };
  }
  var error = error$1;
  function getElementById(id) {
    return typeof document !== "undefined" && document.getElementById
      ? document.getElementById(id)
      : null;
  }
  var TEXTURE0 = 33984;
  var ARRAY_BUFFER = 34962;
  var ELEMENT_ARRAY_BUFFER$1 = 34963;
  var COMPILE_STATUS = 35713;
  var LINK_STATUS = 35714;
  var FRAGMENT_SHADER = 35632;
  var VERTEX_SHADER = 35633;
  var SEPARATE_ATTRIBS = 35981;
  var ACTIVE_UNIFORMS = 35718;
  var ACTIVE_ATTRIBUTES = 35721;
  var TRANSFORM_FEEDBACK_VARYINGS = 35971;
  var ACTIVE_UNIFORM_BLOCKS = 35382;
  var UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER = 35396;
  var UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER = 35398;
  var UNIFORM_BLOCK_DATA_SIZE = 35392;
  var UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES = 35395;
  var FLOAT = 5126;
  var FLOAT_VEC2 = 35664;
  var FLOAT_VEC3 = 35665;
  var FLOAT_VEC4 = 35666;
  var INT = 5124;
  var INT_VEC2 = 35667;
  var INT_VEC3 = 35668;
  var INT_VEC4 = 35669;
  var BOOL = 35670;
  var BOOL_VEC2 = 35671;
  var BOOL_VEC3 = 35672;
  var BOOL_VEC4 = 35673;
  var FLOAT_MAT2 = 35674;
  var FLOAT_MAT3 = 35675;
  var FLOAT_MAT4 = 35676;
  var SAMPLER_2D = 35678;
  var SAMPLER_CUBE = 35680;
  var SAMPLER_3D = 35679;
  var SAMPLER_2D_SHADOW = 35682;
  var FLOAT_MAT2x3 = 35685;
  var FLOAT_MAT2x4 = 35686;
  var FLOAT_MAT3x2 = 35687;
  var FLOAT_MAT3x4 = 35688;
  var FLOAT_MAT4x2 = 35689;
  var FLOAT_MAT4x3 = 35690;
  var SAMPLER_2D_ARRAY = 36289;
  var SAMPLER_2D_ARRAY_SHADOW = 36292;
  var SAMPLER_CUBE_SHADOW = 36293;
  var UNSIGNED_INT = 5125;
  var UNSIGNED_INT_VEC2 = 36294;
  var UNSIGNED_INT_VEC3 = 36295;
  var UNSIGNED_INT_VEC4 = 36296;
  var INT_SAMPLER_2D = 36298;
  var INT_SAMPLER_3D = 36299;
  var INT_SAMPLER_CUBE = 36300;
  var INT_SAMPLER_2D_ARRAY = 36303;
  var UNSIGNED_INT_SAMPLER_2D = 36306;
  var UNSIGNED_INT_SAMPLER_3D = 36307;
  var UNSIGNED_INT_SAMPLER_CUBE = 36308;
  var UNSIGNED_INT_SAMPLER_2D_ARRAY = 36311;
  var TEXTURE_2D$1 = 3553;
  var TEXTURE_CUBE_MAP = 34067;
  var TEXTURE_3D = 32879;
  var TEXTURE_2D_ARRAY = 35866;
  var typeMap = {};
  function getBindPointForSamplerType(gl, type) {
    return typeMap[type].bindPoint;
  }
  function floatSetter(gl, location2) {
    return function (v) {
      gl.uniform1f(location2, v);
    };
  }
  function floatArraySetter(gl, location2) {
    return function (v) {
      gl.uniform1fv(location2, v);
    };
  }
  function floatVec2Setter(gl, location2) {
    return function (v) {
      gl.uniform2fv(location2, v);
    };
  }
  function floatVec3Setter(gl, location2) {
    return function (v) {
      gl.uniform3fv(location2, v);
    };
  }
  function floatVec4Setter(gl, location2) {
    return function (v) {
      gl.uniform4fv(location2, v);
    };
  }
  function intSetter(gl, location2) {
    return function (v) {
      gl.uniform1i(location2, v);
    };
  }
  function intArraySetter(gl, location2) {
    return function (v) {
      gl.uniform1iv(location2, v);
    };
  }
  function intVec2Setter(gl, location2) {
    return function (v) {
      gl.uniform2iv(location2, v);
    };
  }
  function intVec3Setter(gl, location2) {
    return function (v) {
      gl.uniform3iv(location2, v);
    };
  }
  function intVec4Setter(gl, location2) {
    return function (v) {
      gl.uniform4iv(location2, v);
    };
  }
  function uintSetter(gl, location2) {
    return function (v) {
      gl.uniform1ui(location2, v);
    };
  }
  function uintArraySetter(gl, location2) {
    return function (v) {
      gl.uniform1uiv(location2, v);
    };
  }
  function uintVec2Setter(gl, location2) {
    return function (v) {
      gl.uniform2uiv(location2, v);
    };
  }
  function uintVec3Setter(gl, location2) {
    return function (v) {
      gl.uniform3uiv(location2, v);
    };
  }
  function uintVec4Setter(gl, location2) {
    return function (v) {
      gl.uniform4uiv(location2, v);
    };
  }
  function floatMat2Setter(gl, location2) {
    return function (v) {
      gl.uniformMatrix2fv(location2, false, v);
    };
  }
  function floatMat3Setter(gl, location2) {
    return function (v) {
      gl.uniformMatrix3fv(location2, false, v);
    };
  }
  function floatMat4Setter(gl, location2) {
    return function (v) {
      gl.uniformMatrix4fv(location2, false, v);
    };
  }
  function floatMat23Setter(gl, location2) {
    return function (v) {
      gl.uniformMatrix2x3fv(location2, false, v);
    };
  }
  function floatMat32Setter(gl, location2) {
    return function (v) {
      gl.uniformMatrix3x2fv(location2, false, v);
    };
  }
  function floatMat24Setter(gl, location2) {
    return function (v) {
      gl.uniformMatrix2x4fv(location2, false, v);
    };
  }
  function floatMat42Setter(gl, location2) {
    return function (v) {
      gl.uniformMatrix4x2fv(location2, false, v);
    };
  }
  function floatMat34Setter(gl, location2) {
    return function (v) {
      gl.uniformMatrix3x4fv(location2, false, v);
    };
  }
  function floatMat43Setter(gl, location2) {
    return function (v) {
      gl.uniformMatrix4x3fv(location2, false, v);
    };
  }
  function samplerSetter(gl, type, unit, location2) {
    const bindPoint = getBindPointForSamplerType(gl, type);
    return isWebGL2(gl)
      ? function (textureOrPair) {
          let texture;
          let sampler;
          if (!textureOrPair || isTexture(gl, textureOrPair)) {
            texture = textureOrPair;
            sampler = null;
          } else {
            texture = textureOrPair.texture;
            sampler = textureOrPair.sampler;
          }
          gl.uniform1i(location2, unit);
          gl.activeTexture(TEXTURE0 + unit);
          gl.bindTexture(bindPoint, texture);
          gl.bindSampler(unit, sampler);
        }
      : function (texture) {
          gl.uniform1i(location2, unit);
          gl.activeTexture(TEXTURE0 + unit);
          gl.bindTexture(bindPoint, texture);
        };
  }
  function samplerArraySetter(gl, type, unit, location2, size) {
    const bindPoint = getBindPointForSamplerType(gl, type);
    const units = new Int32Array(size);
    for (let ii = 0; ii < size; ++ii) {
      units[ii] = unit + ii;
    }
    return isWebGL2(gl)
      ? function (textures) {
          gl.uniform1iv(location2, units);
          textures.forEach(function (textureOrPair, index) {
            gl.activeTexture(TEXTURE0 + units[index]);
            let texture;
            let sampler;
            if (!textureOrPair || isTexture(gl, textureOrPair)) {
              texture = textureOrPair;
              sampler = null;
            } else {
              texture = textureOrPair.texture;
              sampler = textureOrPair.sampler;
            }
            gl.bindSampler(unit, sampler);
            gl.bindTexture(bindPoint, texture);
          });
        }
      : function (textures) {
          gl.uniform1iv(location2, units);
          textures.forEach(function (texture, index) {
            gl.activeTexture(TEXTURE0 + units[index]);
            gl.bindTexture(bindPoint, texture);
          });
        };
  }
  typeMap[FLOAT] = {
    Type: Float32Array,
    size: 4,
    setter: floatSetter,
    arraySetter: floatArraySetter,
  };
  typeMap[FLOAT_VEC2] = {
    Type: Float32Array,
    size: 8,
    setter: floatVec2Setter,
    cols: 2,
  };
  typeMap[FLOAT_VEC3] = {
    Type: Float32Array,
    size: 12,
    setter: floatVec3Setter,
    cols: 3,
  };
  typeMap[FLOAT_VEC4] = {
    Type: Float32Array,
    size: 16,
    setter: floatVec4Setter,
    cols: 4,
  };
  typeMap[INT] = {
    Type: Int32Array,
    size: 4,
    setter: intSetter,
    arraySetter: intArraySetter,
  };
  typeMap[INT_VEC2] = {
    Type: Int32Array,
    size: 8,
    setter: intVec2Setter,
    cols: 2,
  };
  typeMap[INT_VEC3] = {
    Type: Int32Array,
    size: 12,
    setter: intVec3Setter,
    cols: 3,
  };
  typeMap[INT_VEC4] = {
    Type: Int32Array,
    size: 16,
    setter: intVec4Setter,
    cols: 4,
  };
  typeMap[UNSIGNED_INT] = {
    Type: Uint32Array,
    size: 4,
    setter: uintSetter,
    arraySetter: uintArraySetter,
  };
  typeMap[UNSIGNED_INT_VEC2] = {
    Type: Uint32Array,
    size: 8,
    setter: uintVec2Setter,
    cols: 2,
  };
  typeMap[UNSIGNED_INT_VEC3] = {
    Type: Uint32Array,
    size: 12,
    setter: uintVec3Setter,
    cols: 3,
  };
  typeMap[UNSIGNED_INT_VEC4] = {
    Type: Uint32Array,
    size: 16,
    setter: uintVec4Setter,
    cols: 4,
  };
  typeMap[BOOL] = {
    Type: Uint32Array,
    size: 4,
    setter: intSetter,
    arraySetter: intArraySetter,
  };
  typeMap[BOOL_VEC2] = {
    Type: Uint32Array,
    size: 8,
    setter: intVec2Setter,
    cols: 2,
  };
  typeMap[BOOL_VEC3] = {
    Type: Uint32Array,
    size: 12,
    setter: intVec3Setter,
    cols: 3,
  };
  typeMap[BOOL_VEC4] = {
    Type: Uint32Array,
    size: 16,
    setter: intVec4Setter,
    cols: 4,
  };
  typeMap[FLOAT_MAT2] = {
    Type: Float32Array,
    size: 32,
    setter: floatMat2Setter,
    rows: 2,
    cols: 2,
  };
  typeMap[FLOAT_MAT3] = {
    Type: Float32Array,
    size: 48,
    setter: floatMat3Setter,
    rows: 3,
    cols: 3,
  };
  typeMap[FLOAT_MAT4] = {
    Type: Float32Array,
    size: 64,
    setter: floatMat4Setter,
    rows: 4,
    cols: 4,
  };
  typeMap[FLOAT_MAT2x3] = {
    Type: Float32Array,
    size: 32,
    setter: floatMat23Setter,
    rows: 2,
    cols: 3,
  };
  typeMap[FLOAT_MAT2x4] = {
    Type: Float32Array,
    size: 32,
    setter: floatMat24Setter,
    rows: 2,
    cols: 4,
  };
  typeMap[FLOAT_MAT3x2] = {
    Type: Float32Array,
    size: 48,
    setter: floatMat32Setter,
    rows: 3,
    cols: 2,
  };
  typeMap[FLOAT_MAT3x4] = {
    Type: Float32Array,
    size: 48,
    setter: floatMat34Setter,
    rows: 3,
    cols: 4,
  };
  typeMap[FLOAT_MAT4x2] = {
    Type: Float32Array,
    size: 64,
    setter: floatMat42Setter,
    rows: 4,
    cols: 2,
  };
  typeMap[FLOAT_MAT4x3] = {
    Type: Float32Array,
    size: 64,
    setter: floatMat43Setter,
    rows: 4,
    cols: 3,
  };
  typeMap[SAMPLER_2D] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_2D$1,
  };
  typeMap[SAMPLER_CUBE] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_CUBE_MAP,
  };
  typeMap[SAMPLER_3D] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_3D,
  };
  typeMap[SAMPLER_2D_SHADOW] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_2D$1,
  };
  typeMap[SAMPLER_2D_ARRAY] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_2D_ARRAY,
  };
  typeMap[SAMPLER_2D_ARRAY_SHADOW] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_2D_ARRAY,
  };
  typeMap[SAMPLER_CUBE_SHADOW] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_CUBE_MAP,
  };
  typeMap[INT_SAMPLER_2D] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_2D$1,
  };
  typeMap[INT_SAMPLER_3D] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_3D,
  };
  typeMap[INT_SAMPLER_CUBE] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_CUBE_MAP,
  };
  typeMap[INT_SAMPLER_2D_ARRAY] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_2D_ARRAY,
  };
  typeMap[UNSIGNED_INT_SAMPLER_2D] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_2D$1,
  };
  typeMap[UNSIGNED_INT_SAMPLER_3D] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_3D,
  };
  typeMap[UNSIGNED_INT_SAMPLER_CUBE] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_CUBE_MAP,
  };
  typeMap[UNSIGNED_INT_SAMPLER_2D_ARRAY] = {
    Type: null,
    size: 0,
    setter: samplerSetter,
    arraySetter: samplerArraySetter,
    bindPoint: TEXTURE_2D_ARRAY,
  };
  function floatAttribSetter(gl, index) {
    return function (b) {
      if (b.value) {
        gl.disableVertexAttribArray(index);
        switch (b.value.length) {
          case 4:
            gl.vertexAttrib4fv(index, b.value);
            break;
          case 3:
            gl.vertexAttrib3fv(index, b.value);
            break;
          case 2:
            gl.vertexAttrib2fv(index, b.value);
            break;
          case 1:
            gl.vertexAttrib1fv(index, b.value);
            break;
          default:
            throw new Error(
              "the length of a float constant value must be between 1 and 4!",
            );
        }
      } else {
        gl.bindBuffer(ARRAY_BUFFER, b.buffer);
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(
          index,
          b.numComponents || b.size,
          b.type || FLOAT,
          b.normalize || false,
          b.stride || 0,
          b.offset || 0,
        );
        if (gl.vertexAttribDivisor) {
          gl.vertexAttribDivisor(index, b.divisor || 0);
        }
      }
    };
  }
  function intAttribSetter(gl, index) {
    return function (b) {
      if (b.value) {
        gl.disableVertexAttribArray(index);
        if (b.value.length === 4) {
          gl.vertexAttrib4iv(index, b.value);
        } else {
          throw new Error("The length of an integer constant value must be 4!");
        }
      } else {
        gl.bindBuffer(ARRAY_BUFFER, b.buffer);
        gl.enableVertexAttribArray(index);
        gl.vertexAttribIPointer(
          index,
          b.numComponents || b.size,
          b.type || INT,
          b.stride || 0,
          b.offset || 0,
        );
        if (gl.vertexAttribDivisor) {
          gl.vertexAttribDivisor(index, b.divisor || 0);
        }
      }
    };
  }
  function uintAttribSetter(gl, index) {
    return function (b) {
      if (b.value) {
        gl.disableVertexAttribArray(index);
        if (b.value.length === 4) {
          gl.vertexAttrib4uiv(index, b.value);
        } else {
          throw new Error(
            "The length of an unsigned integer constant value must be 4!",
          );
        }
      } else {
        gl.bindBuffer(ARRAY_BUFFER, b.buffer);
        gl.enableVertexAttribArray(index);
        gl.vertexAttribIPointer(
          index,
          b.numComponents || b.size,
          b.type || UNSIGNED_INT,
          b.stride || 0,
          b.offset || 0,
        );
        if (gl.vertexAttribDivisor) {
          gl.vertexAttribDivisor(index, b.divisor || 0);
        }
      }
    };
  }
  function matAttribSetter(gl, index, typeInfo) {
    const defaultSize = typeInfo.size;
    const count = typeInfo.count;
    return function (b) {
      gl.bindBuffer(ARRAY_BUFFER, b.buffer);
      const numComponents = b.size || b.numComponents || defaultSize;
      const size = numComponents / count;
      const type = b.type || FLOAT;
      const typeInfo2 = typeMap[type];
      const stride = typeInfo2.size * numComponents;
      const normalize = b.normalize || false;
      const offset = b.offset || 0;
      const rowOffset = stride / count;
      for (let i = 0; i < count; ++i) {
        gl.enableVertexAttribArray(index + i);
        gl.vertexAttribPointer(
          index + i,
          size,
          type,
          normalize,
          stride,
          offset + rowOffset * i,
        );
        if (gl.vertexAttribDivisor) {
          gl.vertexAttribDivisor(index + i, b.divisor || 0);
        }
      }
    };
  }
  var attrTypeMap = {};
  attrTypeMap[FLOAT] = { size: 4, setter: floatAttribSetter };
  attrTypeMap[FLOAT_VEC2] = { size: 8, setter: floatAttribSetter };
  attrTypeMap[FLOAT_VEC3] = { size: 12, setter: floatAttribSetter };
  attrTypeMap[FLOAT_VEC4] = { size: 16, setter: floatAttribSetter };
  attrTypeMap[INT] = { size: 4, setter: intAttribSetter };
  attrTypeMap[INT_VEC2] = { size: 8, setter: intAttribSetter };
  attrTypeMap[INT_VEC3] = { size: 12, setter: intAttribSetter };
  attrTypeMap[INT_VEC4] = { size: 16, setter: intAttribSetter };
  attrTypeMap[UNSIGNED_INT] = { size: 4, setter: uintAttribSetter };
  attrTypeMap[UNSIGNED_INT_VEC2] = { size: 8, setter: uintAttribSetter };
  attrTypeMap[UNSIGNED_INT_VEC3] = { size: 12, setter: uintAttribSetter };
  attrTypeMap[UNSIGNED_INT_VEC4] = { size: 16, setter: uintAttribSetter };
  attrTypeMap[BOOL] = { size: 4, setter: intAttribSetter };
  attrTypeMap[BOOL_VEC2] = { size: 8, setter: intAttribSetter };
  attrTypeMap[BOOL_VEC3] = { size: 12, setter: intAttribSetter };
  attrTypeMap[BOOL_VEC4] = { size: 16, setter: intAttribSetter };
  attrTypeMap[FLOAT_MAT2] = { size: 4, setter: matAttribSetter, count: 2 };
  attrTypeMap[FLOAT_MAT3] = { size: 9, setter: matAttribSetter, count: 3 };
  attrTypeMap[FLOAT_MAT4] = { size: 16, setter: matAttribSetter, count: 4 };
  var errorRE = /ERROR:\s*\d+:(\d+)/gi;
  function addLineNumbersWithError(src, log = "", lineOffset = 0) {
    const matches = [...log.matchAll(errorRE)];
    const lineNoToErrorMap = new Map(
      matches.map((m, ndx) => {
        const lineNo = parseInt(m[1]);
        const next = matches[ndx + 1];
        const end = next ? next.index : log.length;
        const msg = log.substring(m.index, end);
        return [lineNo - 1, msg];
      }),
    );
    return src
      .split(
        `
`,
      )
      .map((line, lineNo) => {
        const err = lineNoToErrorMap.get(lineNo);
        return `${lineNo + 1 + lineOffset}: ${line}${
          err
            ? `

^^^ ${err}`
            : ""
        }`;
      }).join(`
`);
  }
  var spaceRE = /^[ \t]*\n/;
  function prepShaderSource(shaderSource) {
    let lineOffset = 0;
    if (spaceRE.test(shaderSource)) {
      lineOffset = 1;
      shaderSource = shaderSource.replace(spaceRE, "");
    }
    return { lineOffset, shaderSource };
  }
  function reportError(progOptions, msg) {
    progOptions.errorCallback(msg);
    if (progOptions.callback) {
      setTimeout(() => {
        progOptions.callback(`${msg}
${progOptions.errors.join(`
`)}`);
      });
    }
    return null;
  }
  function checkShaderStatus(gl, shaderType, shader, errFn) {
    errFn = errFn || error;
    const compiled = gl.getShaderParameter(shader, COMPILE_STATUS);
    if (!compiled) {
      const lastError = gl.getShaderInfoLog(shader);
      const { lineOffset, shaderSource } = prepShaderSource(
        gl.getShaderSource(shader),
      );
      const error2 = `${addLineNumbersWithError(shaderSource, lastError, lineOffset)}
Error compiling ${glEnumToString(gl, shaderType)}: ${lastError}`;
      errFn(error2);
      return error2;
    }
    return "";
  }
  function getProgramOptions(opt_attribs, opt_locations, opt_errorCallback) {
    let transformFeedbackVaryings;
    let transformFeedbackMode;
    let callback;
    if (typeof opt_locations === "function") {
      opt_errorCallback = opt_locations;
      opt_locations = undefined;
    }
    if (typeof opt_attribs === "function") {
      opt_errorCallback = opt_attribs;
      opt_attribs = undefined;
    } else if (opt_attribs && !Array.isArray(opt_attribs)) {
      const opt = opt_attribs;
      opt_errorCallback = opt.errorCallback;
      opt_attribs = opt.attribLocations;
      transformFeedbackVaryings = opt.transformFeedbackVaryings;
      transformFeedbackMode = opt.transformFeedbackMode;
      callback = opt.callback;
    }
    const errorCallback = opt_errorCallback || error;
    const errors = [];
    const options = {
      errorCallback(msg, ...args) {
        errors.push(msg);
        errorCallback(msg, ...args);
      },
      transformFeedbackVaryings,
      transformFeedbackMode,
      callback,
      errors,
    };
    {
      let attribLocations = {};
      if (Array.isArray(opt_attribs)) {
        opt_attribs.forEach(function (attrib, ndx) {
          attribLocations[attrib] = opt_locations ? opt_locations[ndx] : ndx;
        });
      } else {
        attribLocations = opt_attribs || {};
      }
      options.attribLocations = attribLocations;
    }
    return options;
  }
  var defaultShaderType = ["VERTEX_SHADER", "FRAGMENT_SHADER"];
  function getShaderTypeFromScriptType(gl, scriptType) {
    if (scriptType.indexOf("frag") >= 0) {
      return FRAGMENT_SHADER;
    } else if (scriptType.indexOf("vert") >= 0) {
      return VERTEX_SHADER;
    }
    return;
  }
  function deleteProgramAndShaders(gl, program, notThese) {
    const shaders = gl.getAttachedShaders(program);
    for (const shader of shaders) {
      if (!notThese.has(shader)) {
        gl.deleteShader(shader);
      }
    }
    gl.deleteProgram(program);
  }
  var wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
  function createProgramNoCheck(gl, shaders, programOptions) {
    const program = gl.createProgram();
    const {
      attribLocations,
      transformFeedbackVaryings,
      transformFeedbackMode,
    } = getProgramOptions(programOptions);
    for (let ndx = 0; ndx < shaders.length; ++ndx) {
      let shader = shaders[ndx];
      if (typeof shader === "string") {
        const elem = getElementById(shader);
        const src = elem ? elem.text : shader;
        let type = gl[defaultShaderType[ndx]];
        if (elem && elem.type) {
          type = getShaderTypeFromScriptType(gl, elem.type) || type;
        }
        shader = gl.createShader(type);
        gl.shaderSource(shader, prepShaderSource(src).shaderSource);
        gl.compileShader(shader);
      }
      gl.attachShader(program, shader);
    }
    Object.entries(attribLocations).forEach(([attrib, loc]) =>
      gl.bindAttribLocation(program, loc, attrib),
    );
    {
      let varyings = transformFeedbackVaryings;
      if (varyings) {
        if (varyings.attribs) {
          varyings = varyings.attribs;
        }
        if (!Array.isArray(varyings)) {
          varyings = Object.keys(varyings);
        }
        gl.transformFeedbackVaryings(
          program,
          varyings,
          transformFeedbackMode || SEPARATE_ATTRIBS,
        );
      }
    }
    gl.linkProgram(program);
    return program;
  }
  function createProgram(
    gl,
    shaders,
    opt_attribs,
    opt_locations,
    opt_errorCallback,
  ) {
    const progOptions = getProgramOptions(
      opt_attribs,
      opt_locations,
      opt_errorCallback,
    );
    const shaderSet = new Set(shaders);
    const program = createProgramNoCheck(gl, shaders, progOptions);
    function hasErrors(gl2, program2) {
      const errors = getProgramErrors(gl2, program2, progOptions.errorCallback);
      if (errors) {
        deleteProgramAndShaders(gl2, program2, shaderSet);
      }
      return errors;
    }
    if (progOptions.callback) {
      waitForProgramLinkCompletionAsync(gl, program).then(() => {
        const errors = hasErrors(gl, program);
        progOptions.callback(errors, errors ? undefined : program);
      });
      return;
    }
    return hasErrors(gl, program) ? undefined : program;
  }
  function wrapCallbackFnToAsyncFn(fn) {
    return function (gl, arg1, ...args) {
      return new Promise((resolve, reject) => {
        const programOptions = getProgramOptions(...args);
        programOptions.callback = (err, program) => {
          if (err) {
            reject(err);
          } else {
            resolve(program);
          }
        };
        fn(gl, arg1, programOptions);
      });
    };
  }
  var createProgramAsync = wrapCallbackFnToAsyncFn(createProgram);
  var createProgramInfoAsync = wrapCallbackFnToAsyncFn(createProgramInfo);
  async function waitForProgramLinkCompletionAsync(gl, program) {
    const ext = gl.getExtension("KHR_parallel_shader_compile");
    const checkFn = ext
      ? (gl2, program2) =>
          gl2.getProgramParameter(program2, ext.COMPLETION_STATUS_KHR)
      : () => true;
    let waitTime = 0;
    do {
      await wait(waitTime);
      waitTime = 1000 / 60;
    } while (!checkFn(gl, program));
  }
  async function waitForAllProgramsLinkCompletionAsync(gl, programs) {
    for (const program of Object.values(programs)) {
      await waitForProgramLinkCompletionAsync(gl, program);
    }
  }
  function getProgramErrors(gl, program, errFn) {
    errFn = errFn || error;
    const linked = gl.getProgramParameter(program, LINK_STATUS);
    if (!linked) {
      const lastError = gl.getProgramInfoLog(program);
      errFn(`Error in program linking: ${lastError}`);
      const shaders = gl.getAttachedShaders(program);
      const errors = shaders.map((shader) =>
        checkShaderStatus(
          gl,
          gl.getShaderParameter(shader, gl.SHADER_TYPE),
          shader,
          errFn,
        ),
      );
      return `${lastError}
${errors.filter((_) => _).join(`
`)}`;
    }
    return;
  }
  function createProgramFromSources(
    gl,
    shaderSources,
    opt_attribs,
    opt_locations,
    opt_errorCallback,
  ) {
    return createProgram(
      gl,
      shaderSources,
      opt_attribs,
      opt_locations,
      opt_errorCallback,
    );
  }
  function isBuiltIn(info) {
    const name = info.name;
    return name.startsWith("gl_") || name.startsWith("webgl_");
  }
  var tokenRE = /(\.|\[|]|\w+)/g;
  var isDigit = (s) => s >= "0" && s <= "9";
  function addSetterToUniformTree(fullPath, setter, node, uniformSetters) {
    const tokens = fullPath.split(tokenRE).filter((s) => s !== "");
    let tokenNdx = 0;
    let path = "";
    for (;;) {
      const token = tokens[tokenNdx++];
      path += token;
      const isArrayIndex = isDigit(token[0]);
      const accessor = isArrayIndex ? parseInt(token) : token;
      if (isArrayIndex) {
        path += tokens[tokenNdx++];
      }
      const isLastToken = tokenNdx === tokens.length;
      if (isLastToken) {
        node[accessor] = setter;
        break;
      } else {
        const token2 = tokens[tokenNdx++];
        const isArray = token2 === "[";
        const child = node[accessor] || (isArray ? [] : {});
        node[accessor] = child;
        node = child;
        uniformSetters[path] =
          uniformSetters[path] ||
          (function (node2) {
            return function (value) {
              setUniformTree(node2, value);
            };
          })(child);
        path += token2;
      }
    }
  }
  function createUniformSetters(gl, program) {
    let textureUnit = 0;
    function createUniformSetter(program2, uniformInfo, location2) {
      const isArray = uniformInfo.name.endsWith("[0]");
      const type = uniformInfo.type;
      const typeInfo = typeMap[type];
      if (!typeInfo) {
        throw new Error(`unknown type: 0x${type.toString(16)}`);
      }
      let setter;
      if (typeInfo.bindPoint) {
        const unit = textureUnit;
        textureUnit += uniformInfo.size;
        if (isArray) {
          setter = typeInfo.arraySetter(
            gl,
            type,
            unit,
            location2,
            uniformInfo.size,
          );
        } else {
          setter = typeInfo.setter(gl, type, unit, location2, uniformInfo.size);
        }
      } else {
        if (typeInfo.arraySetter && isArray) {
          setter = typeInfo.arraySetter(gl, location2);
        } else {
          setter = typeInfo.setter(gl, location2);
        }
      }
      setter.location = location2;
      return setter;
    }
    const uniformSetters = {};
    const uniformTree = {};
    const numUniforms = gl.getProgramParameter(program, ACTIVE_UNIFORMS);
    for (let ii = 0; ii < numUniforms; ++ii) {
      const uniformInfo = gl.getActiveUniform(program, ii);
      if (isBuiltIn(uniformInfo)) {
        continue;
      }
      let name = uniformInfo.name;
      if (name.endsWith("[0]")) {
        name = name.substr(0, name.length - 3);
      }
      const location2 = gl.getUniformLocation(program, uniformInfo.name);
      if (location2) {
        const setter = createUniformSetter(program, uniformInfo, location2);
        uniformSetters[name] = setter;
        addSetterToUniformTree(name, setter, uniformTree, uniformSetters);
      }
    }
    return uniformSetters;
  }
  function createTransformFeedbackInfo(gl, program) {
    const info = {};
    const numVaryings = gl.getProgramParameter(
      program,
      TRANSFORM_FEEDBACK_VARYINGS,
    );
    for (let ii = 0; ii < numVaryings; ++ii) {
      const varying = gl.getTransformFeedbackVarying(program, ii);
      info[varying.name] = {
        index: ii,
        type: varying.type,
        size: varying.size,
      };
    }
    return info;
  }
  function createUniformBlockSpecFromProgram(gl, program) {
    const numUniforms = gl.getProgramParameter(program, ACTIVE_UNIFORMS);
    const uniformData = [];
    const uniformIndices = [];
    for (let ii = 0; ii < numUniforms; ++ii) {
      uniformIndices.push(ii);
      uniformData.push({});
      const uniformInfo = gl.getActiveUniform(program, ii);
      uniformData[ii].name = uniformInfo.name;
    }
    [
      ["UNIFORM_TYPE", "type"],
      ["UNIFORM_SIZE", "size"],
      ["UNIFORM_BLOCK_INDEX", "blockNdx"],
      ["UNIFORM_OFFSET", "offset"],
    ].forEach(function (pair) {
      const pname = pair[0];
      const key = pair[1];
      gl.getActiveUniforms(program, uniformIndices, gl[pname]).forEach(
        function (value, ndx) {
          uniformData[ndx][key] = value;
        },
      );
    });
    const blockSpecs = {};
    const numUniformBlocks = gl.getProgramParameter(
      program,
      ACTIVE_UNIFORM_BLOCKS,
    );
    for (let ii = 0; ii < numUniformBlocks; ++ii) {
      const name = gl.getActiveUniformBlockName(program, ii);
      const blockSpec = {
        index: gl.getUniformBlockIndex(program, name),
        usedByVertexShader: gl.getActiveUniformBlockParameter(
          program,
          ii,
          UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER,
        ),
        usedByFragmentShader: gl.getActiveUniformBlockParameter(
          program,
          ii,
          UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER,
        ),
        size: gl.getActiveUniformBlockParameter(
          program,
          ii,
          UNIFORM_BLOCK_DATA_SIZE,
        ),
        uniformIndices: gl.getActiveUniformBlockParameter(
          program,
          ii,
          UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES,
        ),
      };
      blockSpec.used =
        blockSpec.usedByVertexShader || blockSpec.usedByFragmentShader;
      blockSpecs[name] = blockSpec;
    }
    return {
      blockSpecs,
      uniformData,
    };
  }
  function setUniformTree(tree, values) {
    for (const name in values) {
      const prop = tree[name];
      if (typeof prop === "function") {
        prop(values[name]);
      } else {
        setUniformTree(tree[name], values[name]);
      }
    }
  }
  function setUniforms(setters, ...args) {
    const actualSetters = setters.uniformSetters || setters;
    const numArgs = args.length;
    for (let aNdx = 0; aNdx < numArgs; ++aNdx) {
      const values = args[aNdx];
      if (Array.isArray(values)) {
        const numValues = values.length;
        for (let ii = 0; ii < numValues; ++ii) {
          setUniforms(actualSetters, values[ii]);
        }
      } else {
        for (const name in values) {
          const setter = actualSetters[name];
          if (setter) {
            setter(values[name]);
          }
        }
      }
    }
  }
  function createAttributeSetters(gl, program) {
    const attribSetters = {};
    const numAttribs = gl.getProgramParameter(program, ACTIVE_ATTRIBUTES);
    for (let ii = 0; ii < numAttribs; ++ii) {
      const attribInfo = gl.getActiveAttrib(program, ii);
      if (isBuiltIn(attribInfo)) {
        continue;
      }
      const index = gl.getAttribLocation(program, attribInfo.name);
      const typeInfo = attrTypeMap[attribInfo.type];
      const setter = typeInfo.setter(gl, index, typeInfo);
      setter.location = index;
      attribSetters[attribInfo.name] = setter;
    }
    return attribSetters;
  }
  function setAttributes(setters, buffers) {
    for (const name in buffers) {
      const setter = setters[name];
      if (setter) {
        setter(buffers[name]);
      }
    }
  }
  function setBuffersAndAttributes(gl, programInfo, buffers) {
    if (buffers.vertexArrayObject) {
      gl.bindVertexArray(buffers.vertexArrayObject);
    } else {
      setAttributes(programInfo.attribSetters || programInfo, buffers.attribs);
      if (buffers.indices) {
        gl.bindBuffer(ELEMENT_ARRAY_BUFFER$1, buffers.indices);
      }
    }
  }
  function createProgramInfoFromProgram(gl, program) {
    const uniformSetters = createUniformSetters(gl, program);
    const attribSetters = createAttributeSetters(gl, program);
    const programInfo = {
      program,
      uniformSetters,
      attribSetters,
      uniformLocations: Object.fromEntries(
        Object.entries(uniformSetters).map(([k, v]) => [k, v.location]),
      ),
      attribLocations: Object.fromEntries(
        Object.entries(attribSetters).map(([k, v]) => [k, v.location]),
      ),
    };
    if (isWebGL2(gl)) {
      programInfo.uniformBlockSpec = createUniformBlockSpecFromProgram(
        gl,
        program,
      );
      programInfo.transformFeedbackInfo = createTransformFeedbackInfo(
        gl,
        program,
      );
    }
    return programInfo;
  }
  var notIdRE = /\s|{|}|;/;
  function createProgramInfo(
    gl,
    shaderSources,
    opt_attribs,
    opt_locations,
    opt_errorCallback,
  ) {
    const progOptions = getProgramOptions(
      opt_attribs,
      opt_locations,
      opt_errorCallback,
    );
    const errors = [];
    shaderSources = shaderSources.map(function (source) {
      if (!notIdRE.test(source)) {
        const script = getElementById(source);
        if (!script) {
          const err = `no element with id: ${source}`;
          progOptions.errorCallback(err);
          errors.push(err);
        } else {
          source = script.text;
        }
      }
      return source;
    });
    if (errors.length) {
      return reportError(progOptions, "");
    }
    const origCallback = progOptions.callback;
    if (origCallback) {
      progOptions.callback = (err, program2) => {
        origCallback(
          err,
          err ? undefined : createProgramInfoFromProgram(gl, program2),
        );
      };
    }
    const program = createProgramFromSources(gl, shaderSources, progOptions);
    if (!program) {
      return null;
    }
    return createProgramInfoFromProgram(gl, program);
  }
  function checkAllPrograms(
    gl,
    programs,
    programSpecs,
    noDeleteShadersSet,
    programOptions,
  ) {
    for (const [name, program] of Object.entries(programs)) {
      const options = { ...programOptions };
      const spec = programSpecs[name];
      if (!Array.isArray(spec)) {
        Object.assign(options, spec);
      }
      const errors = getProgramErrors(gl, program, options.errorCallback);
      if (errors) {
        for (const program2 of Object.values(programs)) {
          const shaders = gl.getAttachedShaders(program2);
          gl.deleteProgram(program2);
          for (const shader of shaders) {
            if (!noDeleteShadersSet.has(shader)) {
              gl.deleteShader(shader);
            }
          }
        }
        return errors;
      }
    }
    return;
  }
  function createPrograms(gl, programSpecs, programOptions = {}) {
    const noDeleteShadersSet = new Set();
    const programs = Object.fromEntries(
      Object.entries(programSpecs).map(([name, spec]) => {
        const options = { ...programOptions };
        const shaders = Array.isArray(spec) ? spec : spec.shaders;
        if (!Array.isArray(spec)) {
          Object.assign(options, spec);
        }
        shaders.forEach(noDeleteShadersSet.add, noDeleteShadersSet);
        return [name, createProgramNoCheck(gl, shaders, options)];
      }),
    );
    if (programOptions.callback) {
      waitForAllProgramsLinkCompletionAsync(gl, programs).then(() => {
        const errors2 = checkAllPrograms(
          gl,
          programs,
          programSpecs,
          noDeleteShadersSet,
          programOptions,
        );
        programOptions.callback(errors2, errors2 ? undefined : programs);
      });
      return;
    }
    const errors = checkAllPrograms(
      gl,
      programs,
      programSpecs,
      noDeleteShadersSet,
      programOptions,
    );
    return errors ? undefined : programs;
  }
  function createProgramInfos(gl, programSpecs, programOptions) {
    programOptions = getProgramOptions(programOptions);
    function createProgramInfosForPrograms(gl2, programs2) {
      return Object.fromEntries(
        Object.entries(programs2).map(([name, program]) => [
          name,
          createProgramInfoFromProgram(gl2, program),
        ]),
      );
    }
    const origCallback = programOptions.callback;
    if (origCallback) {
      programOptions.callback = (err, programs2) => {
        origCallback(
          err,
          err ? undefined : createProgramInfosForPrograms(gl, programs2),
        );
      };
    }
    const programs = createPrograms(gl, programSpecs, programOptions);
    if (origCallback || !programs) {
      return;
    }
    return createProgramInfosForPrograms(gl, programs);
  }
  var createProgramsAsync = wrapCallbackFnToAsyncFn(createPrograms);
  var createProgramInfosAsync = wrapCallbackFnToAsyncFn(createProgramInfos);
  var TRIANGLES = 4;
  var UNSIGNED_SHORT = 5123;
  function drawBufferInfo(gl, bufferInfo, type, count, offset, instanceCount) {
    type = type === undefined ? TRIANGLES : type;
    const indices = bufferInfo.indices;
    const elementType = bufferInfo.elementType;
    const numElements = count === undefined ? bufferInfo.numElements : count;
    offset = offset === undefined ? 0 : offset;
    if (elementType || indices) {
      if (instanceCount !== undefined) {
        gl.drawElementsInstanced(
          type,
          numElements,
          elementType === undefined ? UNSIGNED_SHORT : bufferInfo.elementType,
          offset,
          instanceCount,
        );
      } else {
        gl.drawElements(
          type,
          numElements,
          elementType === undefined ? UNSIGNED_SHORT : bufferInfo.elementType,
          offset,
        );
      }
    } else {
      if (instanceCount !== undefined) {
        gl.drawArraysInstanced(type, offset, numElements, instanceCount);
      } else {
        gl.drawArrays(type, offset, numElements);
      }
    }
  }
  var DEPTH_COMPONENT = 6402;
  var DEPTH_COMPONENT24 = 33190;
  var DEPTH_COMPONENT32F = 36012;
  var DEPTH24_STENCIL8 = 35056;
  var DEPTH32F_STENCIL8 = 36013;
  var RGBA4 = 32854;
  var RGB5_A1 = 32855;
  var RGB565 = 36194;
  var DEPTH_COMPONENT16 = 33189;
  var STENCIL_INDEX = 6401;
  var STENCIL_INDEX8 = 36168;
  var DEPTH_STENCIL = 34041;
  var DEPTH_ATTACHMENT = 36096;
  var STENCIL_ATTACHMENT = 36128;
  var DEPTH_STENCIL_ATTACHMENT = 33306;
  var attachmentsByFormat = {};
  attachmentsByFormat[DEPTH_STENCIL] = DEPTH_STENCIL_ATTACHMENT;
  attachmentsByFormat[STENCIL_INDEX] = STENCIL_ATTACHMENT;
  attachmentsByFormat[STENCIL_INDEX8] = STENCIL_ATTACHMENT;
  attachmentsByFormat[DEPTH_COMPONENT] = DEPTH_ATTACHMENT;
  attachmentsByFormat[DEPTH_COMPONENT16] = DEPTH_ATTACHMENT;
  attachmentsByFormat[DEPTH_COMPONENT24] = DEPTH_ATTACHMENT;
  attachmentsByFormat[DEPTH_COMPONENT32F] = DEPTH_ATTACHMENT;
  attachmentsByFormat[DEPTH24_STENCIL8] = DEPTH_STENCIL_ATTACHMENT;
  attachmentsByFormat[DEPTH32F_STENCIL8] = DEPTH_STENCIL_ATTACHMENT;
  var renderbufferFormats = {};
  renderbufferFormats[RGBA4] = true;
  renderbufferFormats[RGB5_A1] = true;
  renderbufferFormats[RGB565] = true;
  renderbufferFormats[DEPTH_STENCIL] = true;
  renderbufferFormats[DEPTH_COMPONENT16] = true;
  renderbufferFormats[STENCIL_INDEX] = true;
  renderbufferFormats[STENCIL_INDEX8] = true;

  // src/lib/VideoRenderer.ts
  class VideoRenderer {
    gl;
    video;
    VertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;
    FragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_texture;
    varying vec2 v_texCoord;
    
    void main() {
      gl_FragColor = texture2D(u_texture, v_texCoord);
    }
  `;
    videoProgramInfo;
    videoBufferInfo;
    videoTexture;
    constructor(gl, video) {
      this.gl = gl;
      this.video = video;
      this.videoProgramInfo = createProgramInfo(this.gl, [
        this.VertexShaderSource,
        this.FragmentShaderSource,
      ]);
      this.videoBufferInfo = createBufferInfoFromArrays(this.gl, {
        a_position: {
          numComponents: 2,
          data: [-1, -1, 1, -1, -1, 1, 1, 1],
        },
        a_texCoord: {
          numComponents: 2,
          data: [0, 1, 1, 1, 0, 0, 1, 0],
        },
        indices: [0, 1, 2, 1, 2, 3],
      });
      this.videoTexture = this.gl.createTexture();
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.videoTexture);
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_S,
        this.gl.CLAMP_TO_EDGE,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_T,
        this.gl.CLAMP_TO_EDGE,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MIN_FILTER,
        this.gl.LINEAR,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MAG_FILTER,
        this.gl.LINEAR,
      );
    }
    draw() {
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.videoTexture);
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGB10_A2,
        this.gl.RGBA,
        this.gl.UNSIGNED_INT_2_10_10_10_REV,
        this.video,
      );
      this.gl.useProgram(this.videoProgramInfo.program);
      setBuffersAndAttributes(
        this.gl,
        this.videoProgramInfo,
        this.videoBufferInfo,
      );
      const videoUniforms = {
        u_texture: this.videoTexture,
      };
      setUniforms(this.videoProgramInfo, videoUniforms);
      drawBufferInfo(this.gl, this.videoBufferInfo);
    }
  }

  // src/lib/OverlayElementRenderer.ts
  class OverlayElementRenderer {
    gl;
    programInfo;
    bufferInfo;
    textures = new Map();
    textureOverrides = new Map();
    adSlotData = new Map();
    vertexShaderSource = `#version 300 es
    in vec4 a_position;
    in vec2 a_texCoord;
    out vec2 v_texCoord;
    
    void main() {
      gl_Position = a_position;
      v_texCoord = a_texCoord;
    }
  `;
    fragmentShaderSourceWithSSAA = `#version 300 es
    precision mediump float;

    in vec2 v_texCoord;
    uniform int u_samplesX;
    uniform int u_samplesY;
    uniform vec4 u_color;
    uniform sampler2D u_texture;
    uniform bool u_useTexture;
    uniform float u_brightness;
    uniform bool u_enableInnerShadow;
    out vec4 fragColor;

    void main() {
        // Calculate derivatives for texture coordinates
        vec2 duvdx = dFdx(v_texCoord);
        vec2 duvdy = dFdy(v_texCoord);

        vec4 finalColor = vec4(0.0);
        int totalSamples = u_samplesX * u_samplesY;
        float alpha = 0.0;
        // Perform supersampling using derivatives
        for (int i = 0; i < u_samplesX; i++) {
            for (int j = 0; j < u_samplesY; j++) {
                // Calculate sub-pixel offset (-0.5 to 0.5 range)
                vec2 offset = (vec2(float(i), float(j)) + 0.5) / vec2(float(u_samplesX), float(u_samplesY)) - 0.5;
                offset = offset * 4.0;
                // Use derivatives to calculate texture coordinate for this sample
                vec2 sampleTexCoord = v_texCoord + offset.x * duvdx + offset.y * duvdy;

                // Check if sample is within valid texture bounds [0, 1]
                if (sampleTexCoord.x >= 0.0 && sampleTexCoord.x <= 1.0 && 
                    sampleTexCoord.y >= 0.0 && sampleTexCoord.y <= 1.0) {
                    if (u_useTexture) {
                        // finalColor += texture(u_texture, sampleTexCoord);
                        alpha += 1.0;
                    } else {
                        finalColor += u_color;
                    }
                }
            }
        }

        // Average the samples
        // finalColor /= float(totalSamples);
        finalColor = texture(u_texture, v_texCoord);
        
        // Apply brightness adjustment
        finalColor.rgb *= u_brightness;
        
        // Apply inner shadow if enabled (10px from edges, 20% opacity)
        if (u_enableInnerShadow) {
            // Calculate derivatives for pixel-based distance
            vec2 grad = vec2(length(duvdx), length(duvdy));
            
            // Calculate distance from each edge in UV space
            vec2 dist = min(v_texCoord, 1.0 - v_texCoord);
            
            // Convert to pixel units
            vec2 edgeDist = dist / grad;
            
            // Inner shadow width: 10 pixels
            float shadowWidth = 10.0;
            float shadowOpacity = 0.2;

            // Calculate shadow factor for each edge (1.0 = full shadow, 0.0 = no shadow)
            vec2 shadowFactor = 1.0 - smoothstep(0.0, shadowWidth, edgeDist);
            
            // Combine horizontal and vertical shadow factors
            // Use max to get the strongest shadow from any edge
            float shadow = max(shadowFactor.x, shadowFactor.y) * shadowOpacity;
            
            // Apply shadow (darken the color)
            finalColor.rgb *= (1.0 - shadow);
        }
        
        finalColor.a = finalColor.a * alpha / float(totalSamples);
        // Apply alpha blending based on coverage
        if (finalColor.a > 0.0) {
            fragColor = finalColor;
        } else {
            discard;
        }
    }
  `;
    constructor(gl) {
      this.gl = gl;
      this.setupShaders();
      this.setupBuffer();
    }
    async createResizedImageWithAspectRatio(
      imageUrl,
      targetAspectRatio,
      customColor,
    ) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("图片加载失败：" + imageUrl));
      });
      const imgWidth = img.width;
      const imgHeight = img.height;
      const imgAspectRatio = imgWidth / imgHeight;
      let canvasWidth = imgWidth;
      let canvasHeight = imgHeight;
      if (imgAspectRatio > targetAspectRatio) {
        canvasHeight = Math.round(imgWidth / targetAspectRatio);
      } else if (imgAspectRatio < targetAspectRatio) {
        canvasWidth = Math.round(imgHeight * targetAspectRatio);
      }
      const offsetX = Math.floor((canvasWidth - imgWidth) / 2);
      const offsetY = Math.floor((canvasHeight - imgHeight) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法获取 2D 上下文！");
      ctx.drawImage(img, offsetX, offsetY);
      if (customColor) {
        this.fillWithCustomColor(
          ctx,
          customColor,
          offsetX,
          offsetY,
          imgWidth,
          imgHeight,
          canvasWidth,
          canvasHeight,
        );
      } else {
        this.fillWithEdgeColors(
          ctx,
          img,
          offsetX,
          offsetY,
          imgWidth,
          imgHeight,
          canvasWidth,
          canvasHeight,
        );
      }
      return canvas.toDataURL("image/png");
    }
    fillWithCustomColor(
      ctx,
      color,
      offsetX,
      offsetY,
      imgWidth,
      imgHeight,
      canvasWidth,
      canvasHeight,
    ) {
      const fillColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, 0, canvasWidth, offsetY);
      ctx.fillRect(
        0,
        offsetY + imgHeight,
        canvasWidth,
        canvasHeight - (offsetY + imgHeight),
      );
      ctx.fillRect(0, offsetY, offsetX, imgHeight);
      ctx.fillRect(
        offsetX + imgWidth,
        offsetY,
        canvasWidth - (offsetX + imgWidth),
        imgHeight,
      );
    }
    fillWithEdgeColors(
      ctx,
      img,
      offsetX,
      offsetY,
      imgWidth,
      imgHeight,
      canvasWidth,
      canvasHeight,
    ) {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;
      tempCtx.drawImage(img, 0, 0);
      const sampleHeight = 1;
      const topColor = this.getEdgeColor(
        tempCtx,
        0,
        0,
        img.width,
        sampleHeight,
      );
      const bottomColor = this.getEdgeColor(
        tempCtx,
        0,
        img.height - sampleHeight,
        img.width,
        sampleHeight,
      );
      const horizontalColor = this.averageColor(topColor, bottomColor);
      ctx.fillStyle = horizontalColor;
      ctx.fillRect(0, 0, canvasWidth, offsetY);
      ctx.fillRect(
        0,
        offsetY + imgHeight,
        canvasWidth,
        canvasHeight - (offsetY + imgHeight),
      );
      const sampleWidth = Math.min(10, Math.floor(img.width / 10));
      const leftColor = this.getEdgeColor(
        tempCtx,
        0,
        0,
        sampleWidth,
        img.height,
      );
      const rightColor = this.getEdgeColor(
        tempCtx,
        img.width - sampleWidth,
        0,
        sampleWidth,
        img.height,
      );
      const verticalColor = this.averageColor(leftColor, rightColor);
      ctx.fillStyle = verticalColor;
      ctx.fillRect(0, offsetY, offsetX, imgHeight);
      ctx.fillRect(
        offsetX + imgWidth,
        offsetY,
        canvasWidth - (offsetX + imgWidth),
        imgHeight,
      );
    }
    averageColor(color1, color2) {
      const parseRGB = (color) => color.match(/\d+/g)?.map(Number) || [0, 0, 0];
      const [r1, g1, b1] = parseRGB(color1);
      const [r2, g2, b2] = parseRGB(color2);
      const r = Math.floor((r1 + r2) / 2);
      const g = Math.floor((g1 + g2) / 2);
      const b = Math.floor((b1 + b2) / 2);
      return `rgb(${r}, ${g}, ${b})`;
    }
    getEdgeColor(ctx, x, y, width, height) {
      const imageData = ctx.getImageData(x, y, width, height).data;
      let r = 0,
        g = 0,
        b = 0,
        count = 0;
      for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
        count++;
      }
      return `rgb(${Math.floor(r / count)}, ${Math.floor(g / count)}, ${Math.floor(b / count)})`;
    }
    clearAdSlots() {
      for (const tex of this.textures.values()) {
        this.gl.deleteTexture(tex);
      }
      this.textures.clear();
      this.textureOverrides.clear();
      this.adSlotData.clear();
    }
    setOverrideTexture(overlayId, texture) {
      this.textureOverrides.set(overlayId, texture);
    }
    clearOverrideTexture(overlayId) {
      this.textureOverrides.delete(overlayId);
    }
    async loadAdSlots(adSlots) {
      for (const [id, slot] of adSlots.entries()) {
        this.adSlotData.set(id, slot);
        if (slot.mediaType === "gif") {
          continue;
        }
        const tex = this.createTextureFromUrl(
          await this.createResizedImageWithAspectRatio(
            slot.imageUrl,
            slot.adUnitRatio,
            slot.color,
          ),
        );
        this.textures.set(id, await tex);
      }
    }
    async createTextureFromUrl(url) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = url;
      await image.decode();
      const texture = this.gl.createTexture();
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_S,
        this.gl.CLAMP_TO_EDGE,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_T,
        this.gl.CLAMP_TO_EDGE,
      );
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        image,
      );
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MIN_FILTER,
        this.gl.LINEAR_MIPMAP_LINEAR,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MAG_FILTER,
        this.gl.LINEAR,
      );
      const ext =
        this.gl.getExtension("EXT_texture_filter_anisotropic") ||
        this.gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") ||
        this.gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
      if (ext) {
        const maxAnisotropy = this.gl.getParameter(
          ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT,
        );
        this.gl.texParameterf(
          this.gl.TEXTURE_2D,
          ext.TEXTURE_MAX_ANISOTROPY_EXT,
          maxAnisotropy,
        );
      }
      return texture;
    }
    setupShaders() {
      this.programInfo = createProgramInfo(this.gl, [
        this.vertexShaderSource,
        this.fragmentShaderSourceWithSSAA,
      ]);
    }
    setupBuffer() {
      this.bufferInfo = createBufferInfoFromArrays(this.gl, {
        a_position: {
          numComponents: 4,
          data: [0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1],
        },
        a_texCoord: {
          numComponents: 2,
          data: [0, 0, 1, 0, 1, 1, 0, 1],
        },
        indices: [0, 3, 1, 1, 3, 2],
      });
    }
    updateBufferData(vertices) {
      const xs = vertices.map((v) => v.x * 2 - 1);
      const ys = vertices.map((v) => -(v.y * 2 - 1));
      const dx1 = xs[1] - xs[2];
      const dy1 = ys[1] - ys[2];
      const dx2 = xs[3] - xs[2];
      const dy2 = ys[3] - ys[2];
      const sx = xs[0] - xs[1] + xs[2] - xs[3];
      const sy = ys[0] - ys[1] + ys[2] - ys[3];
      const g = (sx * dy2 - dx2 * sy) / (dx1 * dy2 - dx2 * dy1);
      const h = (dx1 * sy - sx * dy1) / (dx1 * dy2 - dx2 * dy1);
      const ws = [1, 1 + g, 1 + g + h, 1 + h];
      const [z0, z1, z2, z3] = ws;
      const positionData = new Float32Array([
        xs[0] * z0,
        ys[0] * z0,
        0,
        z0,
        xs[1] * z1,
        ys[1] * z1,
        0,
        z1,
        xs[2] * z2,
        ys[2] * z2,
        0,
        z2,
        xs[3] * z3,
        ys[3] * z3,
        0,
        z3,
      ]);
      setAttribInfoBufferFromArray(
        this.gl,
        this.bufferInfo.attribs.a_position,
        positionData,
      );
      return positionData;
    }
    draw(overlay, useTexture) {
      this.updateBufferData(overlay.vertices);
      this.gl.useProgram(this.programInfo.program);
      setBuffersAndAttributes(this.gl, this.programInfo, this.bufferInfo);
      const texture =
        this.textureOverrides.get(overlay.id) ??
        this.textures.get(overlay.id) ??
        null;
      const adSlot = this.adSlotData.get(overlay.id);
      const uniforms = {
        u_color: [0, 1, 0, 1],
        u_useTexture: useTexture,
        u_texture: texture,
        u_brightness: adSlot?.brightness ?? 1,
        u_enableInnerShadow: adSlot?.enableInnerShadow ?? false,
        u_samplesX: 16,
        u_samplesY: 16,
      };
      setUniforms(this.programInfo, uniforms);
      drawBufferInfo(this.gl, this.bufferInfo);
    }
  }

  // src/lib/PlayerCanvasLayoutManager.ts
  class PlayerCanvasLayoutManager {
    elements;
    resizeObserver = null;
    animationFrameId = null;
    isPositionUpdateActive = false;
    constructor(elements) {
      if (!elements.videoElement || !elements.canvasElement) {
        throw new Error("Both video and canvas elements are required");
      }
      this.elements = elements;
      const parent = elements.videoElement.parentElement;
      if (getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
      }
      const canvasStyle = elements.canvasElement.style;
      canvasStyle.position = "absolute";
      canvasStyle.pointerEvents = "none";
      this.startPositionUpdates();
      this.updateOverlayPosition();
    }
    dispose() {
      this.stopPositionUpdates();
    }
    updateOverlayPosition() {
      try {
        this.syncCanvasToVideo();
      } catch (error2) {
        console.warn("Failed to update overlay position:", error2);
      }
    }
    startPositionUpdates() {
      if (this.isPositionUpdateActive) return;
      this.isPositionUpdateActive = true;
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => {
          this.updateOverlayPosition();
        });
        this.resizeObserver.observe(this.elements.videoElement);
      }
      const updateLoop = () => {
        if (this.isPositionUpdateActive) {
          this.updateOverlayPosition();
          this.animationFrameId = requestAnimationFrame(updateLoop);
        } else {
          this.animationFrameId = null;
        }
      };
      this.animationFrameId = requestAnimationFrame(updateLoop);
    }
    stopPositionUpdates() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.isPositionUpdateActive = false;
    }
    syncCanvasToVideo() {
      const { videoElement, canvasElement } = this.elements;
      const videoRect = videoElement.getBoundingClientRect();
      const parentRect = videoElement.parentElement.getBoundingClientRect();
      const left = videoRect.left - parentRect.left;
      const top = videoRect.top - parentRect.top;
      const canvasStyle = canvasElement.style;
      canvasStyle.left = `${left}px`;
      canvasStyle.top = `${top}px`;
      canvasStyle.width = `${videoRect.width}px`;
      canvasStyle.height = `${videoRect.height}px`;
    }
  }

  // node_modules/axios/lib/helpers/bind.js
  function bind(fn, thisArg) {
    return function wrap() {
      return fn.apply(thisArg, arguments);
    };
  }

  // node_modules/axios/lib/utils.js
  var { toString } = Object.prototype;
  var { getPrototypeOf } = Object;
  var { iterator, toStringTag } = Symbol;
  var kindOf = ((cache) => (thing) => {
    const str = toString.call(thing);
    return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
  })(Object.create(null));
  var kindOfTest = (type) => {
    type = type.toLowerCase();
    return (thing) => kindOf(thing) === type;
  };
  var typeOfTest = (type) => (thing) => typeof thing === type;
  var { isArray } = Array;
  var isUndefined = typeOfTest("undefined");
  function isBuffer2(val) {
    return (
      val !== null &&
      !isUndefined(val) &&
      val.constructor !== null &&
      !isUndefined(val.constructor) &&
      isFunction(val.constructor.isBuffer) &&
      val.constructor.isBuffer(val)
    );
  }
  var isArrayBuffer2 = kindOfTest("ArrayBuffer");
  function isArrayBufferView(val) {
    let result;
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
      result = ArrayBuffer.isView(val);
    } else {
      result = val && val.buffer && isArrayBuffer2(val.buffer);
    }
    return result;
  }
  var isString = typeOfTest("string");
  var isFunction = typeOfTest("function");
  var isNumber = typeOfTest("number");
  var isObject = (thing) => thing !== null && typeof thing === "object";
  var isBoolean = (thing) => thing === true || thing === false;
  var isPlainObject = (val) => {
    if (kindOf(val) !== "object") {
      return false;
    }
    const prototype = getPrototypeOf(val);
    return (
      (prototype === null ||
        prototype === Object.prototype ||
        Object.getPrototypeOf(prototype) === null) &&
      !(toStringTag in val) &&
      !(iterator in val)
    );
  };
  var isEmptyObject = (val) => {
    if (!isObject(val) || isBuffer2(val)) {
      return false;
    }
    try {
      return (
        Object.keys(val).length === 0 &&
        Object.getPrototypeOf(val) === Object.prototype
      );
    } catch (e) {
      return false;
    }
  };
  var isDate = kindOfTest("Date");
  var isFile = kindOfTest("File");
  var isBlob = kindOfTest("Blob");
  var isFileList = kindOfTest("FileList");
  var isStream = (val) => isObject(val) && isFunction(val.pipe);
  var isFormData = (thing) => {
    let kind;
    return (
      thing &&
      ((typeof FormData === "function" && thing instanceof FormData) ||
        (isFunction(thing.append) &&
          ((kind = kindOf(thing)) === "formdata" ||
            (kind === "object" &&
              isFunction(thing.toString) &&
              thing.toString() === "[object FormData]"))))
    );
  };
  var isURLSearchParams = kindOfTest("URLSearchParams");
  var [isReadableStream, isRequest, isResponse, isHeaders] = [
    "ReadableStream",
    "Request",
    "Response",
    "Headers",
  ].map(kindOfTest);
  var trim = (str) =>
    str.trim
      ? str.trim()
      : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
  function forEach(obj, fn, { allOwnKeys = false } = {}) {
    if (obj === null || typeof obj === "undefined") {
      return;
    }
    let i;
    let l;
    if (typeof obj !== "object") {
      obj = [obj];
    }
    if (isArray(obj)) {
      for (i = 0, l = obj.length; i < l; i++) {
        fn.call(null, obj[i], i, obj);
      }
    } else {
      if (isBuffer2(obj)) {
        return;
      }
      const keys = allOwnKeys
        ? Object.getOwnPropertyNames(obj)
        : Object.keys(obj);
      const len = keys.length;
      let key;
      for (i = 0; i < len; i++) {
        key = keys[i];
        fn.call(null, obj[key], key, obj);
      }
    }
  }
  function findKey(obj, key) {
    if (isBuffer2(obj)) {
      return null;
    }
    key = key.toLowerCase();
    const keys = Object.keys(obj);
    let i = keys.length;
    let _key;
    while (i-- > 0) {
      _key = keys[i];
      if (key === _key.toLowerCase()) {
        return _key;
      }
    }
    return null;
  }
  var _global = (() => {
    if (typeof globalThis !== "undefined") return globalThis;
    return typeof self !== "undefined"
      ? self
      : typeof window !== "undefined"
        ? window
        : global;
  })();
  var isContextDefined = (context) =>
    !isUndefined(context) && context !== _global;
  function merge() {
    const { caseless, skipUndefined } = (isContextDefined(this) && this) || {};
    const result = {};
    const assignValue = (val, key) => {
      const targetKey = (caseless && findKey(result, key)) || key;
      if (isPlainObject(result[targetKey]) && isPlainObject(val)) {
        result[targetKey] = merge(result[targetKey], val);
      } else if (isPlainObject(val)) {
        result[targetKey] = merge({}, val);
      } else if (isArray(val)) {
        result[targetKey] = val.slice();
      } else if (!skipUndefined || !isUndefined(val)) {
        result[targetKey] = val;
      }
    };
    for (let i = 0, l = arguments.length; i < l; i++) {
      arguments[i] && forEach(arguments[i], assignValue);
    }
    return result;
  }
  var extend = (a, b, thisArg, { allOwnKeys } = {}) => {
    forEach(
      b,
      (val, key) => {
        if (thisArg && isFunction(val)) {
          a[key] = bind(val, thisArg);
        } else {
          a[key] = val;
        }
      },
      { allOwnKeys },
    );
    return a;
  };
  var stripBOM = (content) => {
    if (content.charCodeAt(0) === 65279) {
      content = content.slice(1);
    }
    return content;
  };
  var inherits = (constructor, superConstructor, props, descriptors) => {
    constructor.prototype = Object.create(
      superConstructor.prototype,
      descriptors,
    );
    constructor.prototype.constructor = constructor;
    Object.defineProperty(constructor, "super", {
      value: superConstructor.prototype,
    });
    props && Object.assign(constructor.prototype, props);
  };
  var toFlatObject = (sourceObj, destObj, filter, propFilter) => {
    let props;
    let i;
    let prop;
    const merged = {};
    destObj = destObj || {};
    if (sourceObj == null) return destObj;
    do {
      props = Object.getOwnPropertyNames(sourceObj);
      i = props.length;
      while (i-- > 0) {
        prop = props[i];
        if (
          (!propFilter || propFilter(prop, sourceObj, destObj)) &&
          !merged[prop]
        ) {
          destObj[prop] = sourceObj[prop];
          merged[prop] = true;
        }
      }
      sourceObj = filter !== false && getPrototypeOf(sourceObj);
    } while (
      sourceObj &&
      (!filter || filter(sourceObj, destObj)) &&
      sourceObj !== Object.prototype
    );
    return destObj;
  };
  var endsWith = (str, searchString, position) => {
    str = String(str);
    if (position === undefined || position > str.length) {
      position = str.length;
    }
    position -= searchString.length;
    const lastIndex = str.indexOf(searchString, position);
    return lastIndex !== -1 && lastIndex === position;
  };
  var toArray = (thing) => {
    if (!thing) return null;
    if (isArray(thing)) return thing;
    let i = thing.length;
    if (!isNumber(i)) return null;
    const arr = new Array(i);
    while (i-- > 0) {
      arr[i] = thing[i];
    }
    return arr;
  };
  var isTypedArray = ((TypedArray) => {
    return (thing) => {
      return TypedArray && thing instanceof TypedArray;
    };
  })(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
  var forEachEntry = (obj, fn) => {
    const generator = obj && obj[iterator];
    const _iterator = generator.call(obj);
    let result;
    while ((result = _iterator.next()) && !result.done) {
      const pair = result.value;
      fn.call(obj, pair[0], pair[1]);
    }
  };
  var matchAll = (regExp, str) => {
    let matches;
    const arr = [];
    while ((matches = regExp.exec(str)) !== null) {
      arr.push(matches);
    }
    return arr;
  };
  var isHTMLForm = kindOfTest("HTMLFormElement");
  var toCamelCase = (str) => {
    return str
      .toLowerCase()
      .replace(/[-_\s]([a-z\d])(\w*)/g, function replacer(m, p1, p2) {
        return p1.toUpperCase() + p2;
      });
  };
  var hasOwnProperty = (
    ({ hasOwnProperty: hasOwnProperty2 }) =>
    (obj, prop) =>
      hasOwnProperty2.call(obj, prop)
  )(Object.prototype);
  var isRegExp = kindOfTest("RegExp");
  var reduceDescriptors = (obj, reducer) => {
    const descriptors = Object.getOwnPropertyDescriptors(obj);
    const reducedDescriptors = {};
    forEach(descriptors, (descriptor, name) => {
      let ret;
      if ((ret = reducer(descriptor, name, obj)) !== false) {
        reducedDescriptors[name] = ret || descriptor;
      }
    });
    Object.defineProperties(obj, reducedDescriptors);
  };
  var freezeMethods = (obj) => {
    reduceDescriptors(obj, (descriptor, name) => {
      if (
        isFunction(obj) &&
        ["arguments", "caller", "callee"].indexOf(name) !== -1
      ) {
        return false;
      }
      const value = obj[name];
      if (!isFunction(value)) return;
      descriptor.enumerable = false;
      if ("writable" in descriptor) {
        descriptor.writable = false;
        return;
      }
      if (!descriptor.set) {
        descriptor.set = () => {
          throw Error("Can not rewrite read-only method '" + name + "'");
        };
      }
    });
  };
  var toObjectSet = (arrayOrString, delimiter) => {
    const obj = {};
    const define = (arr) => {
      arr.forEach((value) => {
        obj[value] = true;
      });
    };
    isArray(arrayOrString)
      ? define(arrayOrString)
      : define(String(arrayOrString).split(delimiter));
    return obj;
  };
  var noop = () => {};
  var toFiniteNumber = (value, defaultValue) => {
    return value != null && Number.isFinite((value = +value))
      ? value
      : defaultValue;
  };
  function isSpecCompliantForm(thing) {
    return !!(
      thing &&
      isFunction(thing.append) &&
      thing[toStringTag] === "FormData" &&
      thing[iterator]
    );
  }
  var toJSONObject = (obj) => {
    const stack = new Array(10);
    const visit = (source, i) => {
      if (isObject(source)) {
        if (stack.indexOf(source) >= 0) {
          return;
        }
        if (isBuffer2(source)) {
          return source;
        }
        if (!("toJSON" in source)) {
          stack[i] = source;
          const target = isArray(source) ? [] : {};
          forEach(source, (value, key) => {
            const reducedValue = visit(value, i + 1);
            !isUndefined(reducedValue) && (target[key] = reducedValue);
          });
          stack[i] = undefined;
          return target;
        }
      }
      return source;
    };
    return visit(obj, 0);
  };
  var isAsyncFn = kindOfTest("AsyncFunction");
  var isThenable = (thing) =>
    thing &&
    (isObject(thing) || isFunction(thing)) &&
    isFunction(thing.then) &&
    isFunction(thing.catch);
  var _setImmediate = ((setImmediateSupported, postMessageSupported) => {
    if (setImmediateSupported) {
      return setImmediate;
    }
    return postMessageSupported
      ? ((token, callbacks) => {
          _global.addEventListener(
            "message",
            ({ source, data }) => {
              if (source === _global && data === token) {
                callbacks.length && callbacks.shift()();
              }
            },
            false,
          );
          return (cb) => {
            callbacks.push(cb);
            _global.postMessage(token, "*");
          };
        })(`axios@${Math.random()}`, [])
      : (cb) => setTimeout(cb);
  })(typeof setImmediate === "function", isFunction(_global.postMessage));
  var asap =
    typeof queueMicrotask !== "undefined"
      ? queueMicrotask.bind(_global)
      : (typeof process !== "undefined" && process.nextTick) || _setImmediate;
  var isIterable = (thing) => thing != null && isFunction(thing[iterator]);
  var utils_default = {
    isArray,
    isArrayBuffer: isArrayBuffer2,
    isBuffer: isBuffer2,
    isFormData,
    isArrayBufferView,
    isString,
    isNumber,
    isBoolean,
    isObject,
    isPlainObject,
    isEmptyObject,
    isReadableStream,
    isRequest,
    isResponse,
    isHeaders,
    isUndefined,
    isDate,
    isFile,
    isBlob,
    isRegExp,
    isFunction,
    isStream,
    isURLSearchParams,
    isTypedArray,
    isFileList,
    forEach,
    merge,
    extend,
    trim,
    stripBOM,
    inherits,
    toFlatObject,
    kindOf,
    kindOfTest,
    endsWith,
    toArray,
    forEachEntry,
    matchAll,
    isHTMLForm,
    hasOwnProperty,
    hasOwnProp: hasOwnProperty,
    reduceDescriptors,
    freezeMethods,
    toObjectSet,
    toCamelCase,
    noop,
    toFiniteNumber,
    findKey,
    global: _global,
    isContextDefined,
    isSpecCompliantForm,
    toJSONObject,
    isAsyncFn,
    isThenable,
    setImmediate: _setImmediate,
    asap,
    isIterable,
  };

  // node_modules/axios/lib/core/AxiosError.js
  function AxiosError(message, code, config, request, response) {
    Error.call(this);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack;
    }
    this.message = message;
    this.name = "AxiosError";
    code && (this.code = code);
    config && (this.config = config);
    request && (this.request = request);
    if (response) {
      this.response = response;
      this.status = response.status ? response.status : null;
    }
  }
  utils_default.inherits(AxiosError, Error, {
    toJSON: function toJSON() {
      return {
        message: this.message,
        name: this.name,
        description: this.description,
        number: this.number,
        fileName: this.fileName,
        lineNumber: this.lineNumber,
        columnNumber: this.columnNumber,
        stack: this.stack,
        config: utils_default.toJSONObject(this.config),
        code: this.code,
        status: this.status,
      };
    },
  });
  var prototype = AxiosError.prototype;
  var descriptors = {};
  [
    "ERR_BAD_OPTION_VALUE",
    "ERR_BAD_OPTION",
    "ECONNABORTED",
    "ETIMEDOUT",
    "ERR_NETWORK",
    "ERR_FR_TOO_MANY_REDIRECTS",
    "ERR_DEPRECATED",
    "ERR_BAD_RESPONSE",
    "ERR_BAD_REQUEST",
    "ERR_CANCELED",
    "ERR_NOT_SUPPORT",
    "ERR_INVALID_URL",
  ].forEach((code) => {
    descriptors[code] = { value: code };
  });
  Object.defineProperties(AxiosError, descriptors);
  Object.defineProperty(prototype, "isAxiosError", { value: true });
  AxiosError.from = (error2, code, config, request, response, customProps) => {
    const axiosError = Object.create(prototype);
    utils_default.toFlatObject(
      error2,
      axiosError,
      function filter(obj) {
        return obj !== Error.prototype;
      },
      (prop) => {
        return prop !== "isAxiosError";
      },
    );
    const msg = error2 && error2.message ? error2.message : "Error";
    const errCode = code == null && error2 ? error2.code : code;
    AxiosError.call(axiosError, msg, errCode, config, request, response);
    if (error2 && axiosError.cause == null) {
      Object.defineProperty(axiosError, "cause", {
        value: error2,
        configurable: true,
      });
    }
    axiosError.name = (error2 && error2.name) || "Error";
    customProps && Object.assign(axiosError, customProps);
    return axiosError;
  };
  var AxiosError_default = AxiosError;

  // node_modules/axios/lib/helpers/null.js
  var null_default = null;

  // node_modules/axios/lib/helpers/toFormData.js
  function isVisitable(thing) {
    return utils_default.isPlainObject(thing) || utils_default.isArray(thing);
  }
  function removeBrackets(key) {
    return utils_default.endsWith(key, "[]") ? key.slice(0, -2) : key;
  }
  function renderKey(path, key, dots) {
    if (!path) return key;
    return path
      .concat(key)
      .map(function each(token, i) {
        token = removeBrackets(token);
        return !dots && i ? "[" + token + "]" : token;
      })
      .join(dots ? "." : "");
  }
  function isFlatArray(arr) {
    return utils_default.isArray(arr) && !arr.some(isVisitable);
  }
  var predicates = utils_default.toFlatObject(
    utils_default,
    {},
    null,
    function filter(prop) {
      return /^is[A-Z]/.test(prop);
    },
  );
  function toFormData(obj, formData, options) {
    if (!utils_default.isObject(obj)) {
      throw new TypeError("target must be an object");
    }
    formData = formData || new (null_default || FormData)();
    options = utils_default.toFlatObject(
      options,
      {
        metaTokens: true,
        dots: false,
        indexes: false,
      },
      false,
      function defined(option, source) {
        return !utils_default.isUndefined(source[option]);
      },
    );
    const metaTokens = options.metaTokens;
    const visitor = options.visitor || defaultVisitor;
    const dots = options.dots;
    const indexes = options.indexes;
    const _Blob = options.Blob || (typeof Blob !== "undefined" && Blob);
    const useBlob = _Blob && utils_default.isSpecCompliantForm(formData);
    if (!utils_default.isFunction(visitor)) {
      throw new TypeError("visitor must be a function");
    }
    function convertValue(value) {
      if (value === null) return "";
      if (utils_default.isDate(value)) {
        return value.toISOString();
      }
      if (utils_default.isBoolean(value)) {
        return value.toString();
      }
      if (!useBlob && utils_default.isBlob(value)) {
        throw new AxiosError_default(
          "Blob is not supported. Use a Buffer instead.",
        );
      }
      if (
        utils_default.isArrayBuffer(value) ||
        utils_default.isTypedArray(value)
      ) {
        return useBlob && typeof Blob === "function"
          ? new Blob([value])
          : Buffer.from(value);
      }
      return value;
    }
    function defaultVisitor(value, key, path) {
      let arr = value;
      if (value && !path && typeof value === "object") {
        if (utils_default.endsWith(key, "{}")) {
          key = metaTokens ? key : key.slice(0, -2);
          value = JSON.stringify(value);
        } else if (
          (utils_default.isArray(value) && isFlatArray(value)) ||
          ((utils_default.isFileList(value) ||
            utils_default.endsWith(key, "[]")) &&
            (arr = utils_default.toArray(value)))
        ) {
          key = removeBrackets(key);
          arr.forEach(function each(el, index) {
            !(utils_default.isUndefined(el) || el === null) &&
              formData.append(
                indexes === true
                  ? renderKey([key], index, dots)
                  : indexes === null
                    ? key
                    : key + "[]",
                convertValue(el),
              );
          });
          return false;
        }
      }
      if (isVisitable(value)) {
        return true;
      }
      formData.append(renderKey(path, key, dots), convertValue(value));
      return false;
    }
    const stack = [];
    const exposedHelpers = Object.assign(predicates, {
      defaultVisitor,
      convertValue,
      isVisitable,
    });
    function build(value, path) {
      if (utils_default.isUndefined(value)) return;
      if (stack.indexOf(value) !== -1) {
        throw Error("Circular reference detected in " + path.join("."));
      }
      stack.push(value);
      utils_default.forEach(value, function each(el, key) {
        const result =
          !(utils_default.isUndefined(el) || el === null) &&
          visitor.call(
            formData,
            el,
            utils_default.isString(key) ? key.trim() : key,
            path,
            exposedHelpers,
          );
        if (result === true) {
          build(el, path ? path.concat(key) : [key]);
        }
      });
      stack.pop();
    }
    if (!utils_default.isObject(obj)) {
      throw new TypeError("data must be an object");
    }
    build(obj);
    return formData;
  }
  var toFormData_default = toFormData;

  // node_modules/axios/lib/helpers/AxiosURLSearchParams.js
  function encode(str) {
    const charMap = {
      "!": "%21",
      "'": "%27",
      "(": "%28",
      ")": "%29",
      "~": "%7E",
      "%20": "+",
      "%00": "\x00",
    };
    return encodeURIComponent(str).replace(
      /[!'()~]|%20|%00/g,
      function replacer(match) {
        return charMap[match];
      },
    );
  }
  function AxiosURLSearchParams(params, options) {
    this._pairs = [];
    params && toFormData_default(params, this, options);
  }
  var prototype2 = AxiosURLSearchParams.prototype;
  prototype2.append = function append(name, value) {
    this._pairs.push([name, value]);
  };
  prototype2.toString = function toString2(encoder) {
    const _encode = encoder
      ? function (value) {
          return encoder.call(this, value, encode);
        }
      : encode;
    return this._pairs
      .map(function each(pair) {
        return _encode(pair[0]) + "=" + _encode(pair[1]);
      }, "")
      .join("&");
  };
  var AxiosURLSearchParams_default = AxiosURLSearchParams;

  // node_modules/axios/lib/helpers/buildURL.js
  function encode2(val) {
    return encodeURIComponent(val)
      .replace(/%3A/gi, ":")
      .replace(/%24/g, "$")
      .replace(/%2C/gi, ",")
      .replace(/%20/g, "+");
  }
  function buildURL(url, params, options) {
    if (!params) {
      return url;
    }
    const _encode = (options && options.encode) || encode2;
    if (utils_default.isFunction(options)) {
      options = {
        serialize: options,
      };
    }
    const serializeFn = options && options.serialize;
    let serializedParams;
    if (serializeFn) {
      serializedParams = serializeFn(params, options);
    } else {
      serializedParams = utils_default.isURLSearchParams(params)
        ? params.toString()
        : new AxiosURLSearchParams_default(params, options).toString(_encode);
    }
    if (serializedParams) {
      const hashmarkIndex = url.indexOf("#");
      if (hashmarkIndex !== -1) {
        url = url.slice(0, hashmarkIndex);
      }
      url += (url.indexOf("?") === -1 ? "?" : "&") + serializedParams;
    }
    return url;
  }

  // node_modules/axios/lib/core/InterceptorManager.js
  class InterceptorManager {
    constructor() {
      this.handlers = [];
    }
    use(fulfilled, rejected, options) {
      this.handlers.push({
        fulfilled,
        rejected,
        synchronous: options ? options.synchronous : false,
        runWhen: options ? options.runWhen : null,
      });
      return this.handlers.length - 1;
    }
    eject(id) {
      if (this.handlers[id]) {
        this.handlers[id] = null;
      }
    }
    clear() {
      if (this.handlers) {
        this.handlers = [];
      }
    }
    forEach(fn) {
      utils_default.forEach(this.handlers, function forEachHandler(h) {
        if (h !== null) {
          fn(h);
        }
      });
    }
  }
  var InterceptorManager_default = InterceptorManager;

  // node_modules/axios/lib/defaults/transitional.js
  var transitional_default = {
    silentJSONParsing: true,
    forcedJSONParsing: true,
    clarifyTimeoutError: false,
  };

  // node_modules/axios/lib/platform/browser/classes/URLSearchParams.js
  var URLSearchParams_default =
    typeof URLSearchParams !== "undefined"
      ? URLSearchParams
      : AxiosURLSearchParams_default;

  // node_modules/axios/lib/platform/browser/classes/FormData.js
  var FormData_default = typeof FormData !== "undefined" ? FormData : null;

  // node_modules/axios/lib/platform/browser/classes/Blob.js
  var Blob_default = typeof Blob !== "undefined" ? Blob : null;

  // node_modules/axios/lib/platform/browser/index.js
  var browser_default = {
    isBrowser: true,
    classes: {
      URLSearchParams: URLSearchParams_default,
      FormData: FormData_default,
      Blob: Blob_default,
    },
    protocols: ["http", "https", "file", "blob", "url", "data"],
  };

  // node_modules/axios/lib/platform/common/utils.js
  var exports_utils = {};
  __export(exports_utils, {
    origin: () => origin,
    navigator: () => _navigator,
    hasStandardBrowserWebWorkerEnv: () => hasStandardBrowserWebWorkerEnv,
    hasStandardBrowserEnv: () => hasStandardBrowserEnv,
    hasBrowserEnv: () => hasBrowserEnv,
  });
  var hasBrowserEnv =
    typeof window !== "undefined" && typeof document !== "undefined";
  var _navigator = (typeof navigator === "object" && navigator) || undefined;
  var hasStandardBrowserEnv =
    hasBrowserEnv &&
    (!_navigator ||
      ["ReactNative", "NativeScript", "NS"].indexOf(_navigator.product) < 0);
  var hasStandardBrowserWebWorkerEnv = (() => {
    return (
      typeof WorkerGlobalScope !== "undefined" &&
      self instanceof WorkerGlobalScope &&
      typeof self.importScripts === "function"
    );
  })();
  var origin = (hasBrowserEnv && window.location.href) || "http://localhost";

  // node_modules/axios/lib/platform/index.js
  var platform_default = {
    ...exports_utils,
    ...browser_default,
  };

  // node_modules/axios/lib/helpers/toURLEncodedForm.js
  function toURLEncodedForm(data, options) {
    return toFormData_default(
      data,
      new platform_default.classes.URLSearchParams(),
      {
        visitor: function (value, key, path, helpers) {
          if (platform_default.isNode && utils_default.isBuffer(value)) {
            this.append(key, value.toString("base64"));
            return false;
          }
          return helpers.defaultVisitor.apply(this, arguments);
        },
        ...options,
      },
    );
  }

  // node_modules/axios/lib/helpers/formDataToJSON.js
  function parsePropPath(name) {
    return utils_default.matchAll(/\w+|\[(\w*)]/g, name).map((match) => {
      return match[0] === "[]" ? "" : match[1] || match[0];
    });
  }
  function arrayToObject(arr) {
    const obj = {};
    const keys = Object.keys(arr);
    let i;
    const len = keys.length;
    let key;
    for (i = 0; i < len; i++) {
      key = keys[i];
      obj[key] = arr[key];
    }
    return obj;
  }
  function formDataToJSON(formData) {
    function buildPath(path, value, target, index) {
      let name = path[index++];
      if (name === "__proto__") return true;
      const isNumericKey = Number.isFinite(+name);
      const isLast = index >= path.length;
      name = !name && utils_default.isArray(target) ? target.length : name;
      if (isLast) {
        if (utils_default.hasOwnProp(target, name)) {
          target[name] = [target[name], value];
        } else {
          target[name] = value;
        }
        return !isNumericKey;
      }
      if (!target[name] || !utils_default.isObject(target[name])) {
        target[name] = [];
      }
      const result = buildPath(path, value, target[name], index);
      if (result && utils_default.isArray(target[name])) {
        target[name] = arrayToObject(target[name]);
      }
      return !isNumericKey;
    }
    if (
      utils_default.isFormData(formData) &&
      utils_default.isFunction(formData.entries)
    ) {
      const obj = {};
      utils_default.forEachEntry(formData, (name, value) => {
        buildPath(parsePropPath(name), value, obj, 0);
      });
      return obj;
    }
    return null;
  }
  var formDataToJSON_default = formDataToJSON;

  // node_modules/axios/lib/defaults/index.js
  function stringifySafely(rawValue, parser, encoder) {
    if (utils_default.isString(rawValue)) {
      try {
        (parser || JSON.parse)(rawValue);
        return utils_default.trim(rawValue);
      } catch (e) {
        if (e.name !== "SyntaxError") {
          throw e;
        }
      }
    }
    return (encoder || JSON.stringify)(rawValue);
  }
  var defaults = {
    transitional: transitional_default,
    adapter: ["xhr", "http", "fetch"],
    transformRequest: [
      function transformRequest(data, headers) {
        const contentType = headers.getContentType() || "";
        const hasJSONContentType = contentType.indexOf("application/json") > -1;
        const isObjectPayload = utils_default.isObject(data);
        if (isObjectPayload && utils_default.isHTMLForm(data)) {
          data = new FormData(data);
        }
        const isFormData2 = utils_default.isFormData(data);
        if (isFormData2) {
          return hasJSONContentType
            ? JSON.stringify(formDataToJSON_default(data))
            : data;
        }
        if (
          utils_default.isArrayBuffer(data) ||
          utils_default.isBuffer(data) ||
          utils_default.isStream(data) ||
          utils_default.isFile(data) ||
          utils_default.isBlob(data) ||
          utils_default.isReadableStream(data)
        ) {
          return data;
        }
        if (utils_default.isArrayBufferView(data)) {
          return data.buffer;
        }
        if (utils_default.isURLSearchParams(data)) {
          headers.setContentType(
            "application/x-www-form-urlencoded;charset=utf-8",
            false,
          );
          return data.toString();
        }
        let isFileList2;
        if (isObjectPayload) {
          if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
            return toURLEncodedForm(data, this.formSerializer).toString();
          }
          if (
            (isFileList2 = utils_default.isFileList(data)) ||
            contentType.indexOf("multipart/form-data") > -1
          ) {
            const _FormData = this.env && this.env.FormData;
            return toFormData_default(
              isFileList2 ? { "files[]": data } : data,
              _FormData && new _FormData(),
              this.formSerializer,
            );
          }
        }
        if (isObjectPayload || hasJSONContentType) {
          headers.setContentType("application/json", false);
          return stringifySafely(data);
        }
        return data;
      },
    ],
    transformResponse: [
      function transformResponse(data) {
        const transitional = this.transitional || defaults.transitional;
        const forcedJSONParsing =
          transitional && transitional.forcedJSONParsing;
        const JSONRequested = this.responseType === "json";
        if (
          utils_default.isResponse(data) ||
          utils_default.isReadableStream(data)
        ) {
          return data;
        }
        if (
          data &&
          utils_default.isString(data) &&
          ((forcedJSONParsing && !this.responseType) || JSONRequested)
        ) {
          const silentJSONParsing =
            transitional && transitional.silentJSONParsing;
          const strictJSONParsing = !silentJSONParsing && JSONRequested;
          try {
            return JSON.parse(data, this.parseReviver);
          } catch (e) {
            if (strictJSONParsing) {
              if (e.name === "SyntaxError") {
                throw AxiosError_default.from(
                  e,
                  AxiosError_default.ERR_BAD_RESPONSE,
                  this,
                  null,
                  this.response,
                );
              }
              throw e;
            }
          }
        }
        return data;
      },
    ],
    timeout: 0,
    xsrfCookieName: "XSRF-TOKEN",
    xsrfHeaderName: "X-XSRF-TOKEN",
    maxContentLength: -1,
    maxBodyLength: -1,
    env: {
      FormData: platform_default.classes.FormData,
      Blob: platform_default.classes.Blob,
    },
    validateStatus: function validateStatus(status) {
      return status >= 200 && status < 300;
    },
    headers: {
      common: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": undefined,
      },
    },
  };
  utils_default.forEach(
    ["delete", "get", "head", "post", "put", "patch"],
    (method) => {
      defaults.headers[method] = {};
    },
  );
  var defaults_default = defaults;

  // node_modules/axios/lib/helpers/parseHeaders.js
  var ignoreDuplicateOf = utils_default.toObjectSet([
    "age",
    "authorization",
    "content-length",
    "content-type",
    "etag",
    "expires",
    "from",
    "host",
    "if-modified-since",
    "if-unmodified-since",
    "last-modified",
    "location",
    "max-forwards",
    "proxy-authorization",
    "referer",
    "retry-after",
    "user-agent",
  ]);
  var parseHeaders_default = (rawHeaders) => {
    const parsed = {};
    let key;
    let val;
    let i;
    rawHeaders &&
      rawHeaders
        .split(
          `
`,
        )
        .forEach(function parser(line) {
          i = line.indexOf(":");
          key = line.substring(0, i).trim().toLowerCase();
          val = line.substring(i + 1).trim();
          if (!key || (parsed[key] && ignoreDuplicateOf[key])) {
            return;
          }
          if (key === "set-cookie") {
            if (parsed[key]) {
              parsed[key].push(val);
            } else {
              parsed[key] = [val];
            }
          } else {
            parsed[key] = parsed[key] ? parsed[key] + ", " + val : val;
          }
        });
    return parsed;
  };

  // node_modules/axios/lib/core/AxiosHeaders.js
  var $internals = Symbol("internals");
  function normalizeHeader(header) {
    return header && String(header).trim().toLowerCase();
  }
  function normalizeValue(value) {
    if (value === false || value == null) {
      return value;
    }
    return utils_default.isArray(value)
      ? value.map(normalizeValue)
      : String(value);
  }
  function parseTokens(str) {
    const tokens = Object.create(null);
    const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
    let match;
    while ((match = tokensRE.exec(str))) {
      tokens[match[1]] = match[2];
    }
    return tokens;
  }
  var isValidHeaderName = (str) =>
    /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());
  function matchHeaderValue(
    context,
    value,
    header,
    filter2,
    isHeaderNameFilter,
  ) {
    if (utils_default.isFunction(filter2)) {
      return filter2.call(this, value, header);
    }
    if (isHeaderNameFilter) {
      value = header;
    }
    if (!utils_default.isString(value)) return;
    if (utils_default.isString(filter2)) {
      return value.indexOf(filter2) !== -1;
    }
    if (utils_default.isRegExp(filter2)) {
      return filter2.test(value);
    }
  }
  function formatHeader(header) {
    return header
      .trim()
      .toLowerCase()
      .replace(/([a-z\d])(\w*)/g, (w, char, str) => {
        return char.toUpperCase() + str;
      });
  }
  function buildAccessors(obj, header) {
    const accessorName = utils_default.toCamelCase(" " + header);
    ["get", "set", "has"].forEach((methodName) => {
      Object.defineProperty(obj, methodName + accessorName, {
        value: function (arg1, arg2, arg3) {
          return this[methodName].call(this, header, arg1, arg2, arg3);
        },
        configurable: true,
      });
    });
  }

  class AxiosHeaders {
    constructor(headers) {
      headers && this.set(headers);
    }
    set(header, valueOrRewrite, rewrite) {
      const self2 = this;
      function setHeader(_value, _header, _rewrite) {
        const lHeader = normalizeHeader(_header);
        if (!lHeader) {
          throw new Error("header name must be a non-empty string");
        }
        const key = utils_default.findKey(self2, lHeader);
        if (
          !key ||
          self2[key] === undefined ||
          _rewrite === true ||
          (_rewrite === undefined && self2[key] !== false)
        ) {
          self2[key || _header] = normalizeValue(_value);
        }
      }
      const setHeaders = (headers, _rewrite) =>
        utils_default.forEach(headers, (_value, _header) =>
          setHeader(_value, _header, _rewrite),
        );
      if (
        utils_default.isPlainObject(header) ||
        header instanceof this.constructor
      ) {
        setHeaders(header, valueOrRewrite);
      } else if (
        utils_default.isString(header) &&
        (header = header.trim()) &&
        !isValidHeaderName(header)
      ) {
        setHeaders(parseHeaders_default(header), valueOrRewrite);
      } else if (
        utils_default.isObject(header) &&
        utils_default.isIterable(header)
      ) {
        let obj = {},
          dest,
          key;
        for (const entry of header) {
          if (!utils_default.isArray(entry)) {
            throw TypeError("Object iterator must return a key-value pair");
          }
          obj[(key = entry[0])] = (dest = obj[key])
            ? utils_default.isArray(dest)
              ? [...dest, entry[1]]
              : [dest, entry[1]]
            : entry[1];
        }
        setHeaders(obj, valueOrRewrite);
      } else {
        header != null && setHeader(valueOrRewrite, header, rewrite);
      }
      return this;
    }
    get(header, parser) {
      header = normalizeHeader(header);
      if (header) {
        const key = utils_default.findKey(this, header);
        if (key) {
          const value = this[key];
          if (!parser) {
            return value;
          }
          if (parser === true) {
            return parseTokens(value);
          }
          if (utils_default.isFunction(parser)) {
            return parser.call(this, value, key);
          }
          if (utils_default.isRegExp(parser)) {
            return parser.exec(value);
          }
          throw new TypeError("parser must be boolean|regexp|function");
        }
      }
    }
    has(header, matcher) {
      header = normalizeHeader(header);
      if (header) {
        const key = utils_default.findKey(this, header);
        return !!(
          key &&
          this[key] !== undefined &&
          (!matcher || matchHeaderValue(this, this[key], key, matcher))
        );
      }
      return false;
    }
    delete(header, matcher) {
      const self2 = this;
      let deleted = false;
      function deleteHeader(_header) {
        _header = normalizeHeader(_header);
        if (_header) {
          const key = utils_default.findKey(self2, _header);
          if (
            key &&
            (!matcher || matchHeaderValue(self2, self2[key], key, matcher))
          ) {
            delete self2[key];
            deleted = true;
          }
        }
      }
      if (utils_default.isArray(header)) {
        header.forEach(deleteHeader);
      } else {
        deleteHeader(header);
      }
      return deleted;
    }
    clear(matcher) {
      const keys = Object.keys(this);
      let i = keys.length;
      let deleted = false;
      while (i--) {
        const key = keys[i];
        if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
          delete this[key];
          deleted = true;
        }
      }
      return deleted;
    }
    normalize(format) {
      const self2 = this;
      const headers = {};
      utils_default.forEach(this, (value, header) => {
        const key = utils_default.findKey(headers, header);
        if (key) {
          self2[key] = normalizeValue(value);
          delete self2[header];
          return;
        }
        const normalized = format
          ? formatHeader(header)
          : String(header).trim();
        if (normalized !== header) {
          delete self2[header];
        }
        self2[normalized] = normalizeValue(value);
        headers[normalized] = true;
      });
      return this;
    }
    concat(...targets) {
      return this.constructor.concat(this, ...targets);
    }
    toJSON(asStrings) {
      const obj = Object.create(null);
      utils_default.forEach(this, (value, header) => {
        value != null &&
          value !== false &&
          (obj[header] =
            asStrings && utils_default.isArray(value)
              ? value.join(", ")
              : value);
      });
      return obj;
    }
    [Symbol.iterator]() {
      return Object.entries(this.toJSON())[Symbol.iterator]();
    }
    toString() {
      return Object.entries(this.toJSON()).map(
        ([header, value]) => header + ": " + value,
      ).join(`
`);
    }
    getSetCookie() {
      return this.get("set-cookie") || [];
    }
    get [Symbol.toStringTag]() {
      return "AxiosHeaders";
    }
    static from(thing) {
      return thing instanceof this ? thing : new this(thing);
    }
    static concat(first, ...targets) {
      const computed = new this(first);
      targets.forEach((target) => computed.set(target));
      return computed;
    }
    static accessor(header) {
      const internals =
        (this[$internals] =
        this[$internals] =
          {
            accessors: {},
          });
      const accessors = internals.accessors;
      const prototype3 = this.prototype;
      function defineAccessor(_header) {
        const lHeader = normalizeHeader(_header);
        if (!accessors[lHeader]) {
          buildAccessors(prototype3, _header);
          accessors[lHeader] = true;
        }
      }
      utils_default.isArray(header)
        ? header.forEach(defineAccessor)
        : defineAccessor(header);
      return this;
    }
  }
  AxiosHeaders.accessor([
    "Content-Type",
    "Content-Length",
    "Accept",
    "Accept-Encoding",
    "User-Agent",
    "Authorization",
  ]);
  utils_default.reduceDescriptors(AxiosHeaders.prototype, ({ value }, key) => {
    let mapped = key[0].toUpperCase() + key.slice(1);
    return {
      get: () => value,
      set(headerValue) {
        this[mapped] = headerValue;
      },
    };
  });
  utils_default.freezeMethods(AxiosHeaders);
  var AxiosHeaders_default = AxiosHeaders;

  // node_modules/axios/lib/core/transformData.js
  function transformData(fns, response) {
    const config = this || defaults_default;
    const context = response || config;
    const headers = AxiosHeaders_default.from(context.headers);
    let data = context.data;
    utils_default.forEach(fns, function transform(fn) {
      data = fn.call(
        config,
        data,
        headers.normalize(),
        response ? response.status : undefined,
      );
    });
    headers.normalize();
    return data;
  }

  // node_modules/axios/lib/cancel/isCancel.js
  function isCancel(value) {
    return !!(value && value.__CANCEL__);
  }

  // node_modules/axios/lib/cancel/CanceledError.js
  function CanceledError(message, config, request) {
    AxiosError_default.call(
      this,
      message == null ? "canceled" : message,
      AxiosError_default.ERR_CANCELED,
      config,
      request,
    );
    this.name = "CanceledError";
  }
  utils_default.inherits(CanceledError, AxiosError_default, {
    __CANCEL__: true,
  });
  var CanceledError_default = CanceledError;

  // node_modules/axios/lib/core/settle.js
  function settle(resolve, reject, response) {
    const validateStatus2 = response.config.validateStatus;
    if (
      !response.status ||
      !validateStatus2 ||
      validateStatus2(response.status)
    ) {
      resolve(response);
    } else {
      reject(
        new AxiosError_default(
          "Request failed with status code " + response.status,
          [
            AxiosError_default.ERR_BAD_REQUEST,
            AxiosError_default.ERR_BAD_RESPONSE,
          ][Math.floor(response.status / 100) - 4],
          response.config,
          response.request,
          response,
        ),
      );
    }
  }

  // node_modules/axios/lib/helpers/parseProtocol.js
  function parseProtocol(url) {
    const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
    return (match && match[1]) || "";
  }

  // node_modules/axios/lib/helpers/speedometer.js
  function speedometer(samplesCount, min) {
    samplesCount = samplesCount || 10;
    const bytes = new Array(samplesCount);
    const timestamps = new Array(samplesCount);
    let head = 0;
    let tail = 0;
    let firstSampleTS;
    min = min !== undefined ? min : 1000;
    return function push(chunkLength) {
      const now = Date.now();
      const startedAt = timestamps[tail];
      if (!firstSampleTS) {
        firstSampleTS = now;
      }
      bytes[head] = chunkLength;
      timestamps[head] = now;
      let i = tail;
      let bytesCount = 0;
      while (i !== head) {
        bytesCount += bytes[i++];
        i = i % samplesCount;
      }
      head = (head + 1) % samplesCount;
      if (head === tail) {
        tail = (tail + 1) % samplesCount;
      }
      if (now - firstSampleTS < min) {
        return;
      }
      const passed = startedAt && now - startedAt;
      return passed ? Math.round((bytesCount * 1000) / passed) : undefined;
    };
  }
  var speedometer_default = speedometer;

  // node_modules/axios/lib/helpers/throttle.js
  function throttle(fn, freq) {
    let timestamp = 0;
    let threshold = 1000 / freq;
    let lastArgs;
    let timer;
    const invoke = (args, now = Date.now()) => {
      timestamp = now;
      lastArgs = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fn(...args);
    };
    const throttled = (...args) => {
      const now = Date.now();
      const passed = now - timestamp;
      if (passed >= threshold) {
        invoke(args, now);
      } else {
        lastArgs = args;
        if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            invoke(lastArgs);
          }, threshold - passed);
        }
      }
    };
    const flush = () => lastArgs && invoke(lastArgs);
    return [throttled, flush];
  }
  var throttle_default = throttle;

  // node_modules/axios/lib/helpers/progressEventReducer.js
  var progressEventReducer = (listener, isDownloadStream, freq = 3) => {
    let bytesNotified = 0;
    const _speedometer = speedometer_default(50, 250);
    return throttle_default((e) => {
      const loaded = e.loaded;
      const total = e.lengthComputable ? e.total : undefined;
      const progressBytes = loaded - bytesNotified;
      const rate = _speedometer(progressBytes);
      const inRange = loaded <= total;
      bytesNotified = loaded;
      const data = {
        loaded,
        total,
        progress: total ? loaded / total : undefined,
        bytes: progressBytes,
        rate: rate ? rate : undefined,
        estimated:
          rate && total && inRange ? (total - loaded) / rate : undefined,
        event: e,
        lengthComputable: total != null,
        [isDownloadStream ? "download" : "upload"]: true,
      };
      listener(data);
    }, freq);
  };
  var progressEventDecorator = (total, throttled) => {
    const lengthComputable = total != null;
    return [
      (loaded) =>
        throttled[0]({
          lengthComputable,
          total,
          loaded,
        }),
      throttled[1],
    ];
  };
  var asyncDecorator =
    (fn) =>
    (...args) =>
      utils_default.asap(() => fn(...args));

  // node_modules/axios/lib/helpers/isURLSameOrigin.js
  var isURLSameOrigin_default = platform_default.hasStandardBrowserEnv
    ? ((origin2, isMSIE) => (url) => {
        url = new URL(url, platform_default.origin);
        return (
          origin2.protocol === url.protocol &&
          origin2.host === url.host &&
          (isMSIE || origin2.port === url.port)
        );
      })(
        new URL(platform_default.origin),
        platform_default.navigator &&
          /(msie|trident)/i.test(platform_default.navigator.userAgent),
      )
    : () => true;

  // node_modules/axios/lib/helpers/cookies.js
  var cookies_default = platform_default.hasStandardBrowserEnv
    ? {
        write(name, value, expires, path, domain, secure) {
          const cookie = [name + "=" + encodeURIComponent(value)];
          utils_default.isNumber(expires) &&
            cookie.push("expires=" + new Date(expires).toGMTString());
          utils_default.isString(path) && cookie.push("path=" + path);
          utils_default.isString(domain) && cookie.push("domain=" + domain);
          secure === true && cookie.push("secure");
          document.cookie = cookie.join("; ");
        },
        read(name) {
          const match = document.cookie.match(
            new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"),
          );
          return match ? decodeURIComponent(match[3]) : null;
        },
        remove(name) {
          this.write(name, "", Date.now() - 86400000);
        },
      }
    : {
        write() {},
        read() {
          return null;
        },
        remove() {},
      };

  // node_modules/axios/lib/helpers/isAbsoluteURL.js
  function isAbsoluteURL(url) {
    return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
  }

  // node_modules/axios/lib/helpers/combineURLs.js
  function combineURLs(baseURL, relativeURL) {
    return relativeURL
      ? baseURL.replace(/\/?\/$/, "") + "/" + relativeURL.replace(/^\/+/, "")
      : baseURL;
  }

  // node_modules/axios/lib/core/buildFullPath.js
  function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls) {
    let isRelativeUrl = !isAbsoluteURL(requestedURL);
    if (baseURL && (isRelativeUrl || allowAbsoluteUrls == false)) {
      return combineURLs(baseURL, requestedURL);
    }
    return requestedURL;
  }

  // node_modules/axios/lib/core/mergeConfig.js
  var headersToObject = (thing) =>
    thing instanceof AxiosHeaders_default ? { ...thing } : thing;
  function mergeConfig(config1, config2) {
    config2 = config2 || {};
    const config = {};
    function getMergedValue(target, source, prop, caseless) {
      if (
        utils_default.isPlainObject(target) &&
        utils_default.isPlainObject(source)
      ) {
        return utils_default.merge.call({ caseless }, target, source);
      } else if (utils_default.isPlainObject(source)) {
        return utils_default.merge({}, source);
      } else if (utils_default.isArray(source)) {
        return source.slice();
      }
      return source;
    }
    function mergeDeepProperties(a, b, prop, caseless) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(a, b, prop, caseless);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(undefined, a, prop, caseless);
      }
    }
    function valueFromConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(undefined, b);
      }
    }
    function defaultToConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(undefined, b);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(undefined, a);
      }
    }
    function mergeDirectKeys(a, b, prop) {
      if (prop in config2) {
        return getMergedValue(a, b);
      } else if (prop in config1) {
        return getMergedValue(undefined, a);
      }
    }
    const mergeMap = {
      url: valueFromConfig2,
      method: valueFromConfig2,
      data: valueFromConfig2,
      baseURL: defaultToConfig2,
      transformRequest: defaultToConfig2,
      transformResponse: defaultToConfig2,
      paramsSerializer: defaultToConfig2,
      timeout: defaultToConfig2,
      timeoutMessage: defaultToConfig2,
      withCredentials: defaultToConfig2,
      withXSRFToken: defaultToConfig2,
      adapter: defaultToConfig2,
      responseType: defaultToConfig2,
      xsrfCookieName: defaultToConfig2,
      xsrfHeaderName: defaultToConfig2,
      onUploadProgress: defaultToConfig2,
      onDownloadProgress: defaultToConfig2,
      decompress: defaultToConfig2,
      maxContentLength: defaultToConfig2,
      maxBodyLength: defaultToConfig2,
      beforeRedirect: defaultToConfig2,
      transport: defaultToConfig2,
      httpAgent: defaultToConfig2,
      httpsAgent: defaultToConfig2,
      cancelToken: defaultToConfig2,
      socketPath: defaultToConfig2,
      responseEncoding: defaultToConfig2,
      validateStatus: mergeDirectKeys,
      headers: (a, b, prop) =>
        mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true),
    };
    utils_default.forEach(
      Object.keys({ ...config1, ...config2 }),
      function computeConfigValue(prop) {
        const merge2 = mergeMap[prop] || mergeDeepProperties;
        const configValue = merge2(config1[prop], config2[prop], prop);
        (utils_default.isUndefined(configValue) &&
          merge2 !== mergeDirectKeys) ||
          (config[prop] = configValue);
      },
    );
    return config;
  }

  // node_modules/axios/lib/helpers/resolveConfig.js
  var resolveConfig_default = (config) => {
    const newConfig = mergeConfig({}, config);
    let { data, withXSRFToken, xsrfHeaderName, xsrfCookieName, headers, auth } =
      newConfig;
    newConfig.headers = headers = AxiosHeaders_default.from(headers);
    newConfig.url = buildURL(
      buildFullPath(
        newConfig.baseURL,
        newConfig.url,
        newConfig.allowAbsoluteUrls,
      ),
      config.params,
      config.paramsSerializer,
    );
    if (auth) {
      headers.set(
        "Authorization",
        "Basic " +
          btoa(
            (auth.username || "") +
              ":" +
              (auth.password
                ? unescape(encodeURIComponent(auth.password))
                : ""),
          ),
      );
    }
    if (utils_default.isFormData(data)) {
      if (
        platform_default.hasStandardBrowserEnv ||
        platform_default.hasStandardBrowserWebWorkerEnv
      ) {
        headers.setContentType(undefined);
      } else if (utils_default.isFunction(data.getHeaders)) {
        const formHeaders = data.getHeaders();
        const allowedHeaders = ["content-type", "content-length"];
        Object.entries(formHeaders).forEach(([key, val]) => {
          if (allowedHeaders.includes(key.toLowerCase())) {
            headers.set(key, val);
          }
        });
      }
    }
    if (platform_default.hasStandardBrowserEnv) {
      withXSRFToken &&
        utils_default.isFunction(withXSRFToken) &&
        (withXSRFToken = withXSRFToken(newConfig));
      if (
        withXSRFToken ||
        (withXSRFToken !== false && isURLSameOrigin_default(newConfig.url))
      ) {
        const xsrfValue =
          xsrfHeaderName &&
          xsrfCookieName &&
          cookies_default.read(xsrfCookieName);
        if (xsrfValue) {
          headers.set(xsrfHeaderName, xsrfValue);
        }
      }
    }
    return newConfig;
  };

  // node_modules/axios/lib/adapters/xhr.js
  var isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
  var xhr_default =
    isXHRAdapterSupported &&
    function (config) {
      return new Promise(function dispatchXhrRequest(resolve, reject) {
        const _config = resolveConfig_default(config);
        let requestData = _config.data;
        const requestHeaders = AxiosHeaders_default.from(
          _config.headers,
        ).normalize();
        let { responseType, onUploadProgress, onDownloadProgress } = _config;
        let onCanceled;
        let uploadThrottled, downloadThrottled;
        let flushUpload, flushDownload;
        function done() {
          flushUpload && flushUpload();
          flushDownload && flushDownload();
          _config.cancelToken && _config.cancelToken.unsubscribe(onCanceled);
          _config.signal &&
            _config.signal.removeEventListener("abort", onCanceled);
        }
        let request = new XMLHttpRequest();
        request.open(_config.method.toUpperCase(), _config.url, true);
        request.timeout = _config.timeout;
        function onloadend() {
          if (!request) {
            return;
          }
          const responseHeaders = AxiosHeaders_default.from(
            "getAllResponseHeaders" in request &&
              request.getAllResponseHeaders(),
          );
          const responseData =
            !responseType || responseType === "text" || responseType === "json"
              ? request.responseText
              : request.response;
          const response = {
            data: responseData,
            status: request.status,
            statusText: request.statusText,
            headers: responseHeaders,
            config,
            request,
          };
          settle(
            function _resolve(value) {
              resolve(value);
              done();
            },
            function _reject(err) {
              reject(err);
              done();
            },
            response,
          );
          request = null;
        }
        if ("onloadend" in request) {
          request.onloadend = onloadend;
        } else {
          request.onreadystatechange = function handleLoad() {
            if (!request || request.readyState !== 4) {
              return;
            }
            if (
              request.status === 0 &&
              !(
                request.responseURL &&
                request.responseURL.indexOf("file:") === 0
              )
            ) {
              return;
            }
            setTimeout(onloadend);
          };
        }
        request.onabort = function handleAbort() {
          if (!request) {
            return;
          }
          reject(
            new AxiosError_default(
              "Request aborted",
              AxiosError_default.ECONNABORTED,
              config,
              request,
            ),
          );
          request = null;
        };
        request.onerror = function handleError(event) {
          const msg = event && event.message ? event.message : "Network Error";
          const err = new AxiosError_default(
            msg,
            AxiosError_default.ERR_NETWORK,
            config,
            request,
          );
          err.event = event || null;
          reject(err);
          request = null;
        };
        request.ontimeout = function handleTimeout() {
          let timeoutErrorMessage = _config.timeout
            ? "timeout of " + _config.timeout + "ms exceeded"
            : "timeout exceeded";
          const transitional = _config.transitional || transitional_default;
          if (_config.timeoutErrorMessage) {
            timeoutErrorMessage = _config.timeoutErrorMessage;
          }
          reject(
            new AxiosError_default(
              timeoutErrorMessage,
              transitional.clarifyTimeoutError
                ? AxiosError_default.ETIMEDOUT
                : AxiosError_default.ECONNABORTED,
              config,
              request,
            ),
          );
          request = null;
        };
        requestData === undefined && requestHeaders.setContentType(null);
        if ("setRequestHeader" in request) {
          utils_default.forEach(
            requestHeaders.toJSON(),
            function setRequestHeader(val, key) {
              request.setRequestHeader(key, val);
            },
          );
        }
        if (!utils_default.isUndefined(_config.withCredentials)) {
          request.withCredentials = !!_config.withCredentials;
        }
        if (responseType && responseType !== "json") {
          request.responseType = _config.responseType;
        }
        if (onDownloadProgress) {
          [downloadThrottled, flushDownload] = progressEventReducer(
            onDownloadProgress,
            true,
          );
          request.addEventListener("progress", downloadThrottled);
        }
        if (onUploadProgress && request.upload) {
          [uploadThrottled, flushUpload] =
            progressEventReducer(onUploadProgress);
          request.upload.addEventListener("progress", uploadThrottled);
          request.upload.addEventListener("loadend", flushUpload);
        }
        if (_config.cancelToken || _config.signal) {
          onCanceled = (cancel) => {
            if (!request) {
              return;
            }
            reject(
              !cancel || cancel.type
                ? new CanceledError_default(null, config, request)
                : cancel,
            );
            request.abort();
            request = null;
          };
          _config.cancelToken && _config.cancelToken.subscribe(onCanceled);
          if (_config.signal) {
            _config.signal.aborted
              ? onCanceled()
              : _config.signal.addEventListener("abort", onCanceled);
          }
        }
        const protocol = parseProtocol(_config.url);
        if (protocol && platform_default.protocols.indexOf(protocol) === -1) {
          reject(
            new AxiosError_default(
              "Unsupported protocol " + protocol + ":",
              AxiosError_default.ERR_BAD_REQUEST,
              config,
            ),
          );
          return;
        }
        request.send(requestData || null);
      });
    };

  // node_modules/axios/lib/helpers/composeSignals.js
  var composeSignals = (signals, timeout) => {
    const { length: length2 } = (signals = signals
      ? signals.filter(Boolean)
      : []);
    if (timeout || length2) {
      let controller = new AbortController();
      let aborted;
      const onabort = function (reason) {
        if (!aborted) {
          aborted = true;
          unsubscribe();
          const err = reason instanceof Error ? reason : this.reason;
          controller.abort(
            err instanceof AxiosError_default
              ? err
              : new CanceledError_default(
                  err instanceof Error ? err.message : err,
                ),
          );
        }
      };
      let timer =
        timeout &&
        setTimeout(() => {
          timer = null;
          onabort(
            new AxiosError_default(
              `timeout ${timeout} of ms exceeded`,
              AxiosError_default.ETIMEDOUT,
            ),
          );
        }, timeout);
      const unsubscribe = () => {
        if (signals) {
          timer && clearTimeout(timer);
          timer = null;
          signals.forEach((signal2) => {
            signal2.unsubscribe
              ? signal2.unsubscribe(onabort)
              : signal2.removeEventListener("abort", onabort);
          });
          signals = null;
        }
      };
      signals.forEach((signal2) => signal2.addEventListener("abort", onabort));
      const { signal } = controller;
      signal.unsubscribe = () => utils_default.asap(unsubscribe);
      return signal;
    }
  };
  var composeSignals_default = composeSignals;

  // node_modules/axios/lib/helpers/trackStream.js
  var streamChunk = function* (chunk, chunkSize) {
    let len = chunk.byteLength;
    if (!chunkSize || len < chunkSize) {
      yield chunk;
      return;
    }
    let pos = 0;
    let end;
    while (pos < len) {
      end = pos + chunkSize;
      yield chunk.slice(pos, end);
      pos = end;
    }
  };
  var readBytes = async function* (iterable, chunkSize) {
    for await (const chunk of readStream(iterable)) {
      yield* streamChunk(chunk, chunkSize);
    }
  };
  var readStream = async function* (stream) {
    if (stream[Symbol.asyncIterator]) {
      yield* stream;
      return;
    }
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        yield value;
      }
    } finally {
      await reader.cancel();
    }
  };
  var trackStream = (stream, chunkSize, onProgress, onFinish) => {
    const iterator2 = readBytes(stream, chunkSize);
    let bytes = 0;
    let done;
    let _onFinish = (e) => {
      if (!done) {
        done = true;
        onFinish && onFinish(e);
      }
    };
    return new ReadableStream(
      {
        async pull(controller) {
          try {
            const { done: done2, value } = await iterator2.next();
            if (done2) {
              _onFinish();
              controller.close();
              return;
            }
            let len = value.byteLength;
            if (onProgress) {
              let loadedBytes = (bytes += len);
              onProgress(loadedBytes);
            }
            controller.enqueue(new Uint8Array(value));
          } catch (err) {
            _onFinish(err);
            throw err;
          }
        },
        cancel(reason) {
          _onFinish(reason);
          return iterator2.return();
        },
      },
      {
        highWaterMark: 2,
      },
    );
  };

  // node_modules/axios/lib/adapters/fetch.js
  var DEFAULT_CHUNK_SIZE = 64 * 1024;
  var { isFunction: isFunction2 } = utils_default;
  var globalFetchAPI = (({ Request, Response }) => ({
    Request,
    Response,
  }))(utils_default.global);
  var { ReadableStream: ReadableStream2, TextEncoder } = utils_default.global;
  var test = (fn, ...args) => {
    try {
      return !!fn(...args);
    } catch (e) {
      return false;
    }
  };
  var factory = (env) => {
    env = utils_default.merge.call(
      {
        skipUndefined: true,
      },
      globalFetchAPI,
      env,
    );
    const { fetch: envFetch, Request, Response } = env;
    const isFetchSupported = envFetch
      ? isFunction2(envFetch)
      : typeof fetch === "function";
    const isRequestSupported = isFunction2(Request);
    const isResponseSupported = isFunction2(Response);
    if (!isFetchSupported) {
      return false;
    }
    const isReadableStreamSupported =
      isFetchSupported && isFunction2(ReadableStream2);
    const encodeText =
      isFetchSupported &&
      (typeof TextEncoder === "function"
        ? (
            (encoder) => (str) =>
              encoder.encode(str)
          )(new TextEncoder())
        : async (str) => new Uint8Array(await new Request(str).arrayBuffer()));
    const supportsRequestStream =
      isRequestSupported &&
      isReadableStreamSupported &&
      test(() => {
        let duplexAccessed = false;
        const hasContentType = new Request(platform_default.origin, {
          body: new ReadableStream2(),
          method: "POST",
          get duplex() {
            duplexAccessed = true;
            return "half";
          },
        }).headers.has("Content-Type");
        return duplexAccessed && !hasContentType;
      });
    const supportsResponseStream =
      isResponseSupported &&
      isReadableStreamSupported &&
      test(() => utils_default.isReadableStream(new Response("").body));
    const resolvers = {
      stream: supportsResponseStream && ((res) => res.body),
    };
    isFetchSupported &&
      (() => {
        ["text", "arrayBuffer", "blob", "formData", "stream"].forEach(
          (type) => {
            !resolvers[type] &&
              (resolvers[type] = (res, config) => {
                let method = res && res[type];
                if (method) {
                  return method.call(res);
                }
                throw new AxiosError_default(
                  `Response type '${type}' is not supported`,
                  AxiosError_default.ERR_NOT_SUPPORT,
                  config,
                );
              });
          },
        );
      })();
    const getBodyLength = async (body) => {
      if (body == null) {
        return 0;
      }
      if (utils_default.isBlob(body)) {
        return body.size;
      }
      if (utils_default.isSpecCompliantForm(body)) {
        const _request = new Request(platform_default.origin, {
          method: "POST",
          body,
        });
        return (await _request.arrayBuffer()).byteLength;
      }
      if (
        utils_default.isArrayBufferView(body) ||
        utils_default.isArrayBuffer(body)
      ) {
        return body.byteLength;
      }
      if (utils_default.isURLSearchParams(body)) {
        body = body + "";
      }
      if (utils_default.isString(body)) {
        return (await encodeText(body)).byteLength;
      }
    };
    const resolveBodyLength = async (headers, body) => {
      const length2 = utils_default.toFiniteNumber(headers.getContentLength());
      return length2 == null ? getBodyLength(body) : length2;
    };
    return async (config) => {
      let {
        url,
        method,
        data,
        signal,
        cancelToken,
        timeout,
        onDownloadProgress,
        onUploadProgress,
        responseType,
        headers,
        withCredentials = "same-origin",
        fetchOptions,
      } = resolveConfig_default(config);
      let _fetch = envFetch || fetch;
      responseType = responseType ? (responseType + "").toLowerCase() : "text";
      let composedSignal = composeSignals_default(
        [signal, cancelToken && cancelToken.toAbortSignal()],
        timeout,
      );
      let request = null;
      const unsubscribe =
        composedSignal &&
        composedSignal.unsubscribe &&
        (() => {
          composedSignal.unsubscribe();
        });
      let requestContentLength;
      try {
        if (
          onUploadProgress &&
          supportsRequestStream &&
          method !== "get" &&
          method !== "head" &&
          (requestContentLength = await resolveBodyLength(headers, data)) !== 0
        ) {
          let _request = new Request(url, {
            method: "POST",
            body: data,
            duplex: "half",
          });
          let contentTypeHeader;
          if (
            utils_default.isFormData(data) &&
            (contentTypeHeader = _request.headers.get("content-type"))
          ) {
            headers.setContentType(contentTypeHeader);
          }
          if (_request.body) {
            const [onProgress, flush] = progressEventDecorator(
              requestContentLength,
              progressEventReducer(asyncDecorator(onUploadProgress)),
            );
            data = trackStream(
              _request.body,
              DEFAULT_CHUNK_SIZE,
              onProgress,
              flush,
            );
          }
        }
        if (!utils_default.isString(withCredentials)) {
          withCredentials = withCredentials ? "include" : "omit";
        }
        const isCredentialsSupported =
          isRequestSupported && "credentials" in Request.prototype;
        const resolvedOptions = {
          ...fetchOptions,
          signal: composedSignal,
          method: method.toUpperCase(),
          headers: headers.normalize().toJSON(),
          body: data,
          duplex: "half",
          credentials: isCredentialsSupported ? withCredentials : undefined,
        };
        request = isRequestSupported && new Request(url, resolvedOptions);
        let response = await (isRequestSupported
          ? _fetch(request, fetchOptions)
          : _fetch(url, resolvedOptions));
        const isStreamResponse =
          supportsResponseStream &&
          (responseType === "stream" || responseType === "response");
        if (
          supportsResponseStream &&
          (onDownloadProgress || (isStreamResponse && unsubscribe))
        ) {
          const options = {};
          ["status", "statusText", "headers"].forEach((prop) => {
            options[prop] = response[prop];
          });
          const responseContentLength = utils_default.toFiniteNumber(
            response.headers.get("content-length"),
          );
          const [onProgress, flush] =
            (onDownloadProgress &&
              progressEventDecorator(
                responseContentLength,
                progressEventReducer(asyncDecorator(onDownloadProgress), true),
              )) ||
            [];
          response = new Response(
            trackStream(response.body, DEFAULT_CHUNK_SIZE, onProgress, () => {
              flush && flush();
              unsubscribe && unsubscribe();
            }),
            options,
          );
        }
        responseType = responseType || "text";
        let responseData = await resolvers[
          utils_default.findKey(resolvers, responseType) || "text"
        ](response, config);
        !isStreamResponse && unsubscribe && unsubscribe();
        return await new Promise((resolve, reject) => {
          settle(resolve, reject, {
            data: responseData,
            headers: AxiosHeaders_default.from(response.headers),
            status: response.status,
            statusText: response.statusText,
            config,
            request,
          });
        });
      } catch (err) {
        unsubscribe && unsubscribe();
        if (
          err &&
          err.name === "TypeError" &&
          /Load failed|fetch/i.test(err.message)
        ) {
          throw Object.assign(
            new AxiosError_default(
              "Network Error",
              AxiosError_default.ERR_NETWORK,
              config,
              request,
            ),
            {
              cause: err.cause || err,
            },
          );
        }
        throw AxiosError_default.from(err, err && err.code, config, request);
      }
    };
  };
  var seedCache = new Map();
  var getFetch = (config) => {
    let env = config ? config.env : {};
    const { fetch: fetch2, Request, Response } = env;
    const seeds = [Request, Response, fetch2];
    let len = seeds.length,
      i = len,
      seed,
      target,
      map = seedCache;
    while (i--) {
      seed = seeds[i];
      target = map.get(seed);
      target === undefined &&
        map.set(seed, (target = i ? new Map() : factory(env)));
      map = target;
    }
    return target;
  };
  var adapter = getFetch();

  // node_modules/axios/lib/adapters/adapters.js
  var knownAdapters = {
    http: null_default,
    xhr: xhr_default,
    fetch: {
      get: getFetch,
    },
  };
  utils_default.forEach(knownAdapters, (fn, value) => {
    if (fn) {
      try {
        Object.defineProperty(fn, "name", { value });
      } catch (e) {}
      Object.defineProperty(fn, "adapterName", { value });
    }
  });
  var renderReason = (reason) => `- ${reason}`;
  var isResolvedHandle = (adapter2) =>
    utils_default.isFunction(adapter2) ||
    adapter2 === null ||
    adapter2 === false;
  var adapters_default = {
    getAdapter: (adapters, config) => {
      adapters = utils_default.isArray(adapters) ? adapters : [adapters];
      const { length: length2 } = adapters;
      let nameOrAdapter;
      let adapter2;
      const rejectedReasons = {};
      for (let i = 0; i < length2; i++) {
        nameOrAdapter = adapters[i];
        let id;
        adapter2 = nameOrAdapter;
        if (!isResolvedHandle(nameOrAdapter)) {
          adapter2 = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
          if (adapter2 === undefined) {
            throw new AxiosError_default(`Unknown adapter '${id}'`);
          }
        }
        if (
          adapter2 &&
          (utils_default.isFunction(adapter2) ||
            (adapter2 = adapter2.get(config)))
        ) {
          break;
        }
        rejectedReasons[id || "#" + i] = adapter2;
      }
      if (!adapter2) {
        const reasons = Object.entries(rejectedReasons).map(
          ([id, state]) =>
            `adapter ${id} ` +
            (state === false
              ? "is not supported by the environment"
              : "is not available in the build"),
        );
        let s = length2
          ? reasons.length > 1
            ? `since :
` +
              reasons.map(renderReason).join(`
`)
            : " " + renderReason(reasons[0])
          : "as no adapter specified";
        throw new AxiosError_default(
          `There is no suitable adapter to dispatch the request ` + s,
          "ERR_NOT_SUPPORT",
        );
      }
      return adapter2;
    },
    adapters: knownAdapters,
  };

  // node_modules/axios/lib/core/dispatchRequest.js
  function throwIfCancellationRequested(config) {
    if (config.cancelToken) {
      config.cancelToken.throwIfRequested();
    }
    if (config.signal && config.signal.aborted) {
      throw new CanceledError_default(null, config);
    }
  }
  function dispatchRequest(config) {
    throwIfCancellationRequested(config);
    config.headers = AxiosHeaders_default.from(config.headers);
    config.data = transformData.call(config, config.transformRequest);
    if (["post", "put", "patch"].indexOf(config.method) !== -1) {
      config.headers.setContentType("application/x-www-form-urlencoded", false);
    }
    const adapter2 = adapters_default.getAdapter(
      config.adapter || defaults_default.adapter,
      config,
    );
    return adapter2(config).then(
      function onAdapterResolution(response) {
        throwIfCancellationRequested(config);
        response.data = transformData.call(
          config,
          config.transformResponse,
          response,
        );
        response.headers = AxiosHeaders_default.from(response.headers);
        return response;
      },
      function onAdapterRejection(reason) {
        if (!isCancel(reason)) {
          throwIfCancellationRequested(config);
          if (reason && reason.response) {
            reason.response.data = transformData.call(
              config,
              config.transformResponse,
              reason.response,
            );
            reason.response.headers = AxiosHeaders_default.from(
              reason.response.headers,
            );
          }
        }
        return Promise.reject(reason);
      },
    );
  }

  // node_modules/axios/lib/env/data.js
  var VERSION = "1.12.2";

  // node_modules/axios/lib/helpers/validator.js
  var validators = {};
  ["object", "boolean", "number", "function", "string", "symbol"].forEach(
    (type, i) => {
      validators[type] = function validator(thing) {
        return typeof thing === type || "a" + (i < 1 ? "n " : " ") + type;
      };
    },
  );
  var deprecatedWarnings = {};
  validators.transitional = function transitional(validator, version, message) {
    function formatMessage(opt, desc) {
      return (
        "[Axios v" +
        VERSION +
        "] Transitional option '" +
        opt +
        "'" +
        desc +
        (message ? ". " + message : "")
      );
    }
    return (value, opt, opts) => {
      if (validator === false) {
        throw new AxiosError_default(
          formatMessage(
            opt,
            " has been removed" + (version ? " in " + version : ""),
          ),
          AxiosError_default.ERR_DEPRECATED,
        );
      }
      if (version && !deprecatedWarnings[opt]) {
        deprecatedWarnings[opt] = true;
        console.warn(
          formatMessage(
            opt,
            " has been deprecated since v" +
              version +
              " and will be removed in the near future",
          ),
        );
      }
      return validator ? validator(value, opt, opts) : true;
    };
  };
  validators.spelling = function spelling(correctSpelling) {
    return (value, opt) => {
      console.warn(`${opt} is likely a misspelling of ${correctSpelling}`);
      return true;
    };
  };
  function assertOptions(options, schema, allowUnknown) {
    if (typeof options !== "object") {
      throw new AxiosError_default(
        "options must be an object",
        AxiosError_default.ERR_BAD_OPTION_VALUE,
      );
    }
    const keys = Object.keys(options);
    let i = keys.length;
    while (i-- > 0) {
      const opt = keys[i];
      const validator = schema[opt];
      if (validator) {
        const value = options[opt];
        const result = value === undefined || validator(value, opt, options);
        if (result !== true) {
          throw new AxiosError_default(
            "option " + opt + " must be " + result,
            AxiosError_default.ERR_BAD_OPTION_VALUE,
          );
        }
        continue;
      }
      if (allowUnknown !== true) {
        throw new AxiosError_default(
          "Unknown option " + opt,
          AxiosError_default.ERR_BAD_OPTION,
        );
      }
    }
  }
  var validator_default = {
    assertOptions,
    validators,
  };

  // node_modules/axios/lib/core/Axios.js
  var validators2 = validator_default.validators;

  class Axios {
    constructor(instanceConfig) {
      this.defaults = instanceConfig || {};
      this.interceptors = {
        request: new InterceptorManager_default(),
        response: new InterceptorManager_default(),
      };
    }
    async request(configOrUrl, config) {
      try {
        return await this._request(configOrUrl, config);
      } catch (err) {
        if (err instanceof Error) {
          let dummy = {};
          Error.captureStackTrace
            ? Error.captureStackTrace(dummy)
            : (dummy = new Error());
          const stack = dummy.stack ? dummy.stack.replace(/^.+\n/, "") : "";
          try {
            if (!err.stack) {
              err.stack = stack;
            } else if (
              stack &&
              !String(err.stack).endsWith(stack.replace(/^.+\n.+\n/, ""))
            ) {
              err.stack +=
                `
` + stack;
            }
          } catch (e) {}
        }
        throw err;
      }
    }
    _request(configOrUrl, config) {
      if (typeof configOrUrl === "string") {
        config = config || {};
        config.url = configOrUrl;
      } else {
        config = configOrUrl || {};
      }
      config = mergeConfig(this.defaults, config);
      const { transitional: transitional2, paramsSerializer, headers } = config;
      if (transitional2 !== undefined) {
        validator_default.assertOptions(
          transitional2,
          {
            silentJSONParsing: validators2.transitional(validators2.boolean),
            forcedJSONParsing: validators2.transitional(validators2.boolean),
            clarifyTimeoutError: validators2.transitional(validators2.boolean),
          },
          false,
        );
      }
      if (paramsSerializer != null) {
        if (utils_default.isFunction(paramsSerializer)) {
          config.paramsSerializer = {
            serialize: paramsSerializer,
          };
        } else {
          validator_default.assertOptions(
            paramsSerializer,
            {
              encode: validators2.function,
              serialize: validators2.function,
            },
            true,
          );
        }
      }
      if (config.allowAbsoluteUrls !== undefined) {
      } else if (this.defaults.allowAbsoluteUrls !== undefined) {
        config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
      } else {
        config.allowAbsoluteUrls = true;
      }
      validator_default.assertOptions(
        config,
        {
          baseUrl: validators2.spelling("baseURL"),
          withXsrfToken: validators2.spelling("withXSRFToken"),
        },
        true,
      );
      config.method = (
        config.method ||
        this.defaults.method ||
        "get"
      ).toLowerCase();
      let contextHeaders =
        headers && utils_default.merge(headers.common, headers[config.method]);
      headers &&
        utils_default.forEach(
          ["delete", "get", "head", "post", "put", "patch", "common"],
          (method) => {
            delete headers[method];
          },
        );
      config.headers = AxiosHeaders_default.concat(contextHeaders, headers);
      const requestInterceptorChain = [];
      let synchronousRequestInterceptors = true;
      this.interceptors.request.forEach(
        function unshiftRequestInterceptors(interceptor) {
          if (
            typeof interceptor.runWhen === "function" &&
            interceptor.runWhen(config) === false
          ) {
            return;
          }
          synchronousRequestInterceptors =
            synchronousRequestInterceptors && interceptor.synchronous;
          requestInterceptorChain.unshift(
            interceptor.fulfilled,
            interceptor.rejected,
          );
        },
      );
      const responseInterceptorChain = [];
      this.interceptors.response.forEach(
        function pushResponseInterceptors(interceptor) {
          responseInterceptorChain.push(
            interceptor.fulfilled,
            interceptor.rejected,
          );
        },
      );
      let promise;
      let i = 0;
      let len;
      if (!synchronousRequestInterceptors) {
        const chain = [dispatchRequest.bind(this), undefined];
        chain.unshift(...requestInterceptorChain);
        chain.push(...responseInterceptorChain);
        len = chain.length;
        promise = Promise.resolve(config);
        while (i < len) {
          promise = promise.then(chain[i++], chain[i++]);
        }
        return promise;
      }
      len = requestInterceptorChain.length;
      let newConfig = config;
      while (i < len) {
        const onFulfilled = requestInterceptorChain[i++];
        const onRejected = requestInterceptorChain[i++];
        try {
          newConfig = onFulfilled(newConfig);
        } catch (error2) {
          onRejected.call(this, error2);
          break;
        }
      }
      try {
        promise = dispatchRequest.call(this, newConfig);
      } catch (error2) {
        return Promise.reject(error2);
      }
      i = 0;
      len = responseInterceptorChain.length;
      while (i < len) {
        promise = promise.then(
          responseInterceptorChain[i++],
          responseInterceptorChain[i++],
        );
      }
      return promise;
    }
    getUri(config) {
      config = mergeConfig(this.defaults, config);
      const fullPath = buildFullPath(
        config.baseURL,
        config.url,
        config.allowAbsoluteUrls,
      );
      return buildURL(fullPath, config.params, config.paramsSerializer);
    }
  }
  utils_default.forEach(
    ["delete", "get", "head", "options"],
    function forEachMethodNoData(method) {
      Axios.prototype[method] = function (url, config) {
        return this.request(
          mergeConfig(config || {}, {
            method,
            url,
            data: (config || {}).data,
          }),
        );
      };
    },
  );
  utils_default.forEach(
    ["post", "put", "patch"],
    function forEachMethodWithData(method) {
      function generateHTTPMethod(isForm) {
        return function httpMethod(url, data, config) {
          return this.request(
            mergeConfig(config || {}, {
              method,
              headers: isForm
                ? {
                    "Content-Type": "multipart/form-data",
                  }
                : {},
              url,
              data,
            }),
          );
        };
      }
      Axios.prototype[method] = generateHTTPMethod();
      Axios.prototype[method + "Form"] = generateHTTPMethod(true);
    },
  );
  var Axios_default = Axios;

  // node_modules/axios/lib/cancel/CancelToken.js
  class CancelToken {
    constructor(executor) {
      if (typeof executor !== "function") {
        throw new TypeError("executor must be a function.");
      }
      let resolvePromise;
      this.promise = new Promise(function promiseExecutor(resolve) {
        resolvePromise = resolve;
      });
      const token = this;
      this.promise.then((cancel) => {
        if (!token._listeners) return;
        let i = token._listeners.length;
        while (i-- > 0) {
          token._listeners[i](cancel);
        }
        token._listeners = null;
      });
      this.promise.then = (onfulfilled) => {
        let _resolve;
        const promise = new Promise((resolve) => {
          token.subscribe(resolve);
          _resolve = resolve;
        }).then(onfulfilled);
        promise.cancel = function reject() {
          token.unsubscribe(_resolve);
        };
        return promise;
      };
      executor(function cancel(message, config, request) {
        if (token.reason) {
          return;
        }
        token.reason = new CanceledError_default(message, config, request);
        resolvePromise(token.reason);
      });
    }
    throwIfRequested() {
      if (this.reason) {
        throw this.reason;
      }
    }
    subscribe(listener) {
      if (this.reason) {
        listener(this.reason);
        return;
      }
      if (this._listeners) {
        this._listeners.push(listener);
      } else {
        this._listeners = [listener];
      }
    }
    unsubscribe(listener) {
      if (!this._listeners) {
        return;
      }
      const index = this._listeners.indexOf(listener);
      if (index !== -1) {
        this._listeners.splice(index, 1);
      }
    }
    toAbortSignal() {
      const controller = new AbortController();
      const abort = (err) => {
        controller.abort(err);
      };
      this.subscribe(abort);
      controller.signal.unsubscribe = () => this.unsubscribe(abort);
      return controller.signal;
    }
    static source() {
      let cancel;
      const token = new CancelToken(function executor(c) {
        cancel = c;
      });
      return {
        token,
        cancel,
      };
    }
  }
  var CancelToken_default = CancelToken;

  // node_modules/axios/lib/helpers/spread.js
  function spread(callback) {
    return function wrap(arr) {
      return callback.apply(null, arr);
    };
  }

  // node_modules/axios/lib/helpers/isAxiosError.js
  function isAxiosError(payload) {
    return utils_default.isObject(payload) && payload.isAxiosError === true;
  }

  // node_modules/axios/lib/helpers/HttpStatusCode.js
  var HttpStatusCode = {
    Continue: 100,
    SwitchingProtocols: 101,
    Processing: 102,
    EarlyHints: 103,
    Ok: 200,
    Created: 201,
    Accepted: 202,
    NonAuthoritativeInformation: 203,
    NoContent: 204,
    ResetContent: 205,
    PartialContent: 206,
    MultiStatus: 207,
    AlreadyReported: 208,
    ImUsed: 226,
    MultipleChoices: 300,
    MovedPermanently: 301,
    Found: 302,
    SeeOther: 303,
    NotModified: 304,
    UseProxy: 305,
    Unused: 306,
    TemporaryRedirect: 307,
    PermanentRedirect: 308,
    BadRequest: 400,
    Unauthorized: 401,
    PaymentRequired: 402,
    Forbidden: 403,
    NotFound: 404,
    MethodNotAllowed: 405,
    NotAcceptable: 406,
    ProxyAuthenticationRequired: 407,
    RequestTimeout: 408,
    Conflict: 409,
    Gone: 410,
    LengthRequired: 411,
    PreconditionFailed: 412,
    PayloadTooLarge: 413,
    UriTooLong: 414,
    UnsupportedMediaType: 415,
    RangeNotSatisfiable: 416,
    ExpectationFailed: 417,
    ImATeapot: 418,
    MisdirectedRequest: 421,
    UnprocessableEntity: 422,
    Locked: 423,
    FailedDependency: 424,
    TooEarly: 425,
    UpgradeRequired: 426,
    PreconditionRequired: 428,
    TooManyRequests: 429,
    RequestHeaderFieldsTooLarge: 431,
    UnavailableForLegalReasons: 451,
    InternalServerError: 500,
    NotImplemented: 501,
    BadGateway: 502,
    ServiceUnavailable: 503,
    GatewayTimeout: 504,
    HttpVersionNotSupported: 505,
    VariantAlsoNegotiates: 506,
    InsufficientStorage: 507,
    LoopDetected: 508,
    NotExtended: 510,
    NetworkAuthenticationRequired: 511,
  };
  Object.entries(HttpStatusCode).forEach(([key, value]) => {
    HttpStatusCode[value] = key;
  });
  var HttpStatusCode_default = HttpStatusCode;

  // node_modules/axios/lib/axios.js
  function createInstance(defaultConfig) {
    const context = new Axios_default(defaultConfig);
    const instance = bind(Axios_default.prototype.request, context);
    utils_default.extend(instance, Axios_default.prototype, context, {
      allOwnKeys: true,
    });
    utils_default.extend(instance, context, null, { allOwnKeys: true });
    instance.create = function create(instanceConfig) {
      return createInstance(mergeConfig(defaultConfig, instanceConfig));
    };
    return instance;
  }
  var axios = createInstance(defaults_default);
  axios.Axios = Axios_default;
  axios.CanceledError = CanceledError_default;
  axios.CancelToken = CancelToken_default;
  axios.isCancel = isCancel;
  axios.VERSION = VERSION;
  axios.toFormData = toFormData_default;
  axios.AxiosError = AxiosError_default;
  axios.Cancel = axios.CanceledError;
  axios.all = function all(promises) {
    return Promise.all(promises);
  };
  axios.spread = spread;
  axios.isAxiosError = isAxiosError;
  axios.mergeConfig = mergeConfig;
  axios.AxiosHeaders = AxiosHeaders_default;
  axios.formToJSON = (thing) =>
    formDataToJSON_default(
      utils_default.isHTMLForm(thing) ? new FormData(thing) : thing,
    );
  axios.getAdapter = adapters_default.getAdapter;
  axios.HttpStatusCode = HttpStatusCode_default;
  axios.default = axios;
  var axios_default = axios;

  // src/lib/HttpService.ts
  class UploadImpressionService {
    deliveryId;
    version;
    //logHost = "https://example.com";
    constructor(deliveryId, version) {
      this.deliveryId = deliveryId;
      this.version = version;
    }
    async uploadImpression(adProductId, logData) {
      const url = `${this.logHost}/api/AdLog/AdProduct/${adProductId}/Delivery/${this.deliveryId}/Impression`;
      const headers = {
        "Content-Type": "application/json",
        "X-Log-Id": crypto.randomUUID(),
        "X-Client-Version": this.version,
      };
      try {
        const response = await axios_default.post(url, logData, { headers });
        return response.data;
      } catch (error2) {
        console.error("Error uploading impression:", error2);
        throw error2;
      }
    }
  }

  class AllProcessService {
    //host = "https://example.com";
    allProcessDataBaseUrl = `${this.host}/api/Preference/pubVideoId`;
    secretKey;
    constructor(secretKey) {
      this.secretKey = secretKey;
    }
    async getAllProcessedData(pubVideoId, clientType, userLabel) {
      const url = `${this.allProcessDataBaseUrl}/${encodeURIComponent(pubVideoId)}/delivery`;
      const headers = {
        "Content-Type": "application/json",
        secretKey: this.secretKey,
      };
      const params = { clientType };
      if (userLabel && userLabel.length > 0) {
        params.userLabel = userLabel;
      }
      try {
        const response = await axios_default.post(url, null, {
          headers,
          params,
        });
        return response.data;
      } catch (error2) {
        console.error("Error fetching processed data:", error2);
        throw error2;
      }
    }
  }

  // src/lib/GifAdPlayer.ts
  var import_gifuct_js = __toESM(require_lib2());

  class GifAdPlayer {
    gl;
    frames = [];
    totalDuration = 0;
    gifWidth = 0;
    gifHeight = 0;
    textureCache = new Map();
    static MAX_CACHE_SIZE = 30;
    _ready = false;
    readyPromise;
    previousCanvasState = null;
    constructor(gl, gifUrl) {
      this.gl = gl;
      this.readyPromise = this.initialize(gifUrl);
    }
    get isReady() {
      return this._ready;
    }
    async waitUntilReady() {
      return this.readyPromise;
    }
    get width() {
      return this.gifWidth;
    }
    get height() {
      return this.gifHeight;
    }
    async initialize(gifUrl) {
      try {
        const response = await fetch(gifUrl);
        const buffer = await response.arrayBuffer();
        const gif = import_gifuct_js.parseGIF(buffer);
        const rawFrames = import_gifuct_js.decompressFrames(gif, true);
        if (rawFrames.length === 0) {
          throw new Error("GIF has no frames");
        }
        this.gifWidth = gif.lsd.width;
        this.gifHeight = gif.lsd.height;
        const compositeCanvas =
          typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(this.gifWidth, this.gifHeight)
            : document.createElement("canvas");
        if (compositeCanvas instanceof HTMLCanvasElement) {
          compositeCanvas.width = this.gifWidth;
          compositeCanvas.height = this.gifHeight;
        }
        const ctx = compositeCanvas.getContext("2d");
        const patchCanvas =
          typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(1, 1)
            : document.createElement("canvas");
        let cumulativeTime = 0;
        for (const rawFrame of rawFrames) {
          if (rawFrame.disposalType === 3) {
            this.previousCanvasState = ctx.getImageData(
              0,
              0,
              this.gifWidth,
              this.gifHeight,
            );
          }
          const pw = rawFrame.dims.width;
          const ph = rawFrame.dims.height;
          if (patchCanvas instanceof OffscreenCanvas) {
            patchCanvas.width = pw;
            patchCanvas.height = ph;
          } else {
            patchCanvas.width = pw;
            patchCanvas.height = ph;
          }
          const patchCtx = patchCanvas.getContext("2d");
          const patchImageData = new ImageData(
            new Uint8ClampedArray(rawFrame.patch),
            pw,
            ph,
          );
          patchCtx.putImageData(patchImageData, 0, 0);
          ctx.drawImage(patchCanvas, rawFrame.dims.left, rawFrame.dims.top);
          const fullFrame = ctx.getImageData(
            0,
            0,
            this.gifWidth,
            this.gifHeight,
          );
          const delayMs = rawFrame.delay <= 0 ? 100 : rawFrame.delay;
          this.frames.push({
            imageData: fullFrame,
            delay: delayMs,
            cumulativeTime,
          });
          cumulativeTime += delayMs;
          switch (rawFrame.disposalType) {
            case 2:
              ctx.clearRect(
                rawFrame.dims.left,
                rawFrame.dims.top,
                rawFrame.dims.width,
                rawFrame.dims.height,
              );
              break;
            case 3:
              if (this.previousCanvasState) {
                ctx.putImageData(this.previousCanvasState, 0, 0);
              }
              break;
          }
        }
        this.totalDuration = cumulativeTime;
        this._ready = true;
      } catch (error2) {
        console.error(`GifAdPlayer: failed to load GIF`, error2);
      }
    }
    getGifFrameIndex(videoFrameIndex, adStartFrame, videoFps) {
      if (!this._ready || this.frames.length === 0) return 0;
      const relativeFrame = videoFrameIndex - adStartFrame;
      if (relativeFrame < 0) return 0;
      const elapsedMs = (relativeFrame / videoFps) * 1000;
      const loopedMs = elapsedMs % this.totalDuration;
      let lo = 0;
      let hi = this.frames.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (this.frames[mid].cumulativeTime <= loopedMs) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return lo;
    }
    getTexture(gifFrameIndex) {
      if (
        !this._ready ||
        gifFrameIndex < 0 ||
        gifFrameIndex >= this.frames.length
      ) {
        return null;
      }
      const cached = this.textureCache.get(gifFrameIndex);
      if (cached) {
        cached.lastUsedTime = performance.now();
        return cached.texture;
      }
      if (this.textureCache.size >= GifAdPlayer.MAX_CACHE_SIZE) {
        this.evictLRU();
      }
      const texture = this.createTextureFromImageData(
        this.frames[gifFrameIndex].imageData,
      );
      if (!texture) return null;
      this.textureCache.set(gifFrameIndex, {
        texture,
        lastUsedTime: performance.now(),
      });
      return texture;
    }
    getTextureForVideoFrame(videoFrameIndex, adStartFrame, videoFps) {
      const idx = this.getGifFrameIndex(
        videoFrameIndex,
        adStartFrame,
        videoFps,
      );
      return this.getTexture(idx);
    }
    createTextureFromImageData(imageData) {
      const texture = this.gl.createTexture();
      if (!texture) return null;
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_S,
        this.gl.CLAMP_TO_EDGE,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_T,
        this.gl.CLAMP_TO_EDGE,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MIN_FILTER,
        this.gl.LINEAR,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MAG_FILTER,
        this.gl.LINEAR,
      );
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        imageData,
      );
      return texture;
    }
    evictLRU() {
      let oldestTime = Infinity;
      let oldestKey = -1;
      for (const [key, entry] of this.textureCache) {
        if (entry.lastUsedTime < oldestTime) {
          oldestTime = entry.lastUsedTime;
          oldestKey = key;
        }
      }
      if (oldestKey >= 0) {
        const entry = this.textureCache.get(oldestKey);
        if (entry) {
          this.gl.deleteTexture(entry.texture);
          this.textureCache.delete(oldestKey);
        }
      }
    }
    dispose() {
      for (const [, entry] of this.textureCache) {
        this.gl.deleteTexture(entry.texture);
      }
      this.textureCache.clear();
      this.frames = [];
    }
  }

  // src/lib/VideoOverlay.ts
  class VideoOverlayController {
    video;
    canvas;
    option;
    secretKey;
    userLabel;
    pubVideoId;
    enableStartPtsIgnoreEditList;
    gl;
    renderId = null;
    disposed = false;
    overlayRenderer;
    _layoutManager;
    _drawingBufferColorSpace = "display-p3";
    _unpackColorSpace = "display-p3";
    videoRenderer;
    renderCount = 0;
    version = "virtual-ads-sdk.v0.2.1";
    overlays;
    gifPlayers = new Map();
    adFrameTracking = new Map();
    activeAdSlotIndices = new Set();
    impressionService = null;
    lastFrameIndex = null;
    constructor(
      video,
      canvas,
      option,
      secretKey,
      userLabel,
      pubVideoId,
      enableStartPtsIgnoreEditList,
    ) {
      this.video = video;
      this.canvas = canvas;
      this.option = option;
      this.secretKey = secretKey;
      this.userLabel = userLabel;
      this.pubVideoId = pubVideoId;
      this.enableStartPtsIgnoreEditList = enableStartPtsIgnoreEditList;
      const service = new AllProcessService(this.secretKey);
      console.log('"virtual-ads-sdk" , version:', this.version);
      window.videoOverlay = this;
      let clientType = navigator.userAgent.includes("Windows NT")
        ? "desktop"
        : "mobile";
      service
        .getAllProcessedData(this.pubVideoId, clientType, this.userLabel)
        .then(async (data) => {
          this.impressionService = new UploadImpressionService(
            data.deliveryId,
            this.version,
          );
          const overlays = await this.parseData(data);
          this.overlays = overlays;
          for (const [adIndex, adSlot] of overlays.adSlots.entries()) {
            if (adSlot.mediaType === "gif") {
              const player = new GifAdPlayer(this.gl, adSlot.imageUrl);
              this.gifPlayers.set(adIndex, player);
            }
          }
          this.overlayRenderer.loadAdSlots(this.overlays.adSlots);
        });
      const gl = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: false,
      });
      if (!gl) {
        throw new Error("Could not get WebGL context from canvas");
      }
      this.gl = gl;
      gl.drawingBufferColorSpace = this._drawingBufferColorSpace;
      gl.unpackColorSpace = this._unpackColorSpace;
      this.setupCanvas();
      this.videoRenderer = new VideoRenderer(this.gl, this.video);
      this.overlayRenderer = new OverlayElementRenderer(this.gl);
      this.renderId = this.video.requestVideoFrameCallback(this.render);
      this._layoutManager = new PlayerCanvasLayoutManager({
        videoElement: this.video,
        canvasElement: this.canvas,
      });
      setInterval(() => {
        this.renderCount = 0;
      }, 1000);
    }
    async parseData(data) {
      const elements = new Map();
      const validInstances = data.adInstances.instance_valid;
      const instances = data.adInstances.ad_units_instances;
      for (const frame in instances) {
        const frameData = instances[frame];
        for (const id in frameData) {
          if (validInstances[id] !== true) {
            continue;
          }
          const adData = frameData[id].unit;
          const vertices = [
            { x: adData[0][0], y: adData[0][1] },
            { x: adData[1][0], y: adData[1][1] },
            { x: adData[2][0], y: adData[2][1] },
            { x: adData[3][0], y: adData[3][1] },
          ];
          if (!elements.has(+frame)) {
            elements.set(+frame, []);
          }
          elements.get(+frame).push({ id, vertices });
        }
      }
      const adSlots = new Map();
      const adStartFrames = new Map();
      for (const [frame, overlays] of elements.entries()) {
        for (const overlay of overlays) {
          const existing = adStartFrames.get(overlay.id);
          if (existing === undefined || frame < existing) {
            adStartFrames.set(overlay.id, frame);
          }
        }
      }
      for (const ad of data.ads) {
        const hasColor =
          ad.red !== null && ad.green !== null && ad.blue !== null;
        const imageUrl = ad.imageUrl;
        let isGif = false;
        try {
          const resp = await fetch(imageUrl);
          const buffer = await resp.arrayBuffer();
          if (buffer.byteLength >= 6) {
            const header = new TextDecoder().decode(
              new Uint8Array(buffer, 0, 6),
            );
            isGif = header === "GIF89a" || header === "GIF87a";
          }
        } catch (e) {
          console.error("Failed to detect media type for:", imageUrl, e);
        }
        adSlots.set(ad.adIndex, {
          id: ad.imageId,
          adId: ad.adId,
          adProductId: ad.adProductId,
          adSlotId: ad.adSlotId,
          imageUrl: ad.imageUrl,
          adUnitRatio: ad.adUnitRatio,
          color: hasColor
            ? { r: ad.red, g: ad.green, b: ad.blue, a: ad.alpha ?? 1 }
            : null,
          brightness: ad.brightness ?? 1,
          enableInnerShadow: ad.enableInnerShadow ?? false,
          mediaType: isGif ? "gif" : "image",
          startFrame: adStartFrames.get(String(ad.adIndex)) ?? 0,
        });
      }
      return {
        elements,
        metadata: {
          width: data.videoMeta.width,
          height: data.videoMeta.height,
          fps: data.videoMeta.fps,
          totalFrames: data.videoMeta.n_frames,
          ig_pts_time: data.adInstances.ig_pts_time?.["0"] ?? 0,
        },
        adSlots,
      };
    }
    get fps() {
      return (
        this.overlays?.metadata?.fps ??
        Math.round(
          (this.overlays?.metadata?.totalFrames ?? 1) / this.video.duration,
        )
      );
    }
    get processedWidth() {
      return this.overlays?.metadata?.width ?? this.video.videoWidth;
    }
    get processedHeight() {
      return this.overlays?.metadata?.height ?? this.video.videoHeight;
    }
    play() {
      this.video.play();
    }
    pause() {
      this.video.pause();
    }
    get playbackRate() {
      return this.video.playbackRate;
    }
    set playbackRate(value) {
      this.video.playbackRate = value;
    }
    get duration() {
      return this.video.duration;
    }
    get drawingBufferColorSpace() {
      return this._drawingBufferColorSpace;
    }
    set drawingBufferColorSpace(value) {
      this._drawingBufferColorSpace = value;
      this.gl.drawingBufferColorSpace = value;
    }
    get unpackColorSpace() {
      return this._unpackColorSpace;
    }
    set unpackColorSpace(value) {
      this._unpackColorSpace = value;
      this.gl.unpackColorSpace = value;
    }
    [Symbol.dispose] = () => {
      this.dispose();
    };
    dispose() {
      if (this.disposed) {
        return;
      }
      this.disposed = true;
      if (this.renderId !== null) {
        this.video.cancelVideoFrameCallback(this.renderId);
        this.renderId = null;
      }
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = undefined;
      }
      this.overlays = undefined;
      this.lastFrameIndex = null;
      this.adFrameTracking.clear();
      this.activeAdSlotIndices.clear();
      this.impressionService = null;
      for (const player of this.gifPlayers.values()) {
        player.dispose();
      }
      this.gifPlayers.clear();
      this.overlayRenderer.clearAdSlots();
      this._layoutManager.dispose();
      this.canvas.remove();
    }
    setVideoTime(time) {
      this.video.currentTime = time;
    }
    controlStateListeners = [];
    emitControlStateChanged() {
      for (const l of this.controlStateListeners) {
        l();
      }
    }
    subscribeControlState = (listener) => {
      this.controlStateListeners.push(listener);
      return () => {
        this.controlStateListeners = this.controlStateListeners.filter(
          (l) => l !== listener,
        );
      };
    };
    controlState = {
      isPlaying: false,
    };
    getControlState = () => this.controlState;
    toggleDrawImage() {
      this.option = {
        ...this.option,
        drawImage: !this.option.drawImage,
      };
    }
    setDrawImage(drawImage) {
      this.option = {
        ...this.option,
        drawImage,
      };
    }
    resizeCanvas() {
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    setupCanvas() {
      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 360;
      this.video.addEventListener("loadedmetadata", () => {
        this.resizeCanvas();
      });
    }
    animationFrameId;
    normalizeOverlay(overlay) {
      const offset = 0;
      const normalizedVertices = [
        {
          x: (overlay.vertices[0].x + offset) / this.processedWidth,
          y: overlay.vertices[0].y / this.processedHeight,
        },
        {
          x: (overlay.vertices[1].x + offset) / this.processedWidth,
          y: overlay.vertices[1].y / this.processedHeight,
        },
        {
          x: (overlay.vertices[2].x + offset) / this.processedWidth,
          y: overlay.vertices[2].y / this.processedHeight,
        },
        {
          x: (overlay.vertices[3].x + offset) / this.processedWidth,
          y: overlay.vertices[3].y / this.processedHeight,
        },
      ];
      return {
        id: overlay.id,
        vertices: normalizedVertices,
      };
    }
    loopIndex = -1;
    loopRanges = [[1312, 1315]];
    _mediaTime = 0;
    get mediaTime() {
      return this._mediaTime;
    }
    set mediaTime(value) {
      this.setVideoTime(value);
    }
    get timeOffset() {
      return this.overlays?.metadata?.ig_pts_time ?? 0;
    }
    debugTimeOffset = 0;
    get frameIndex() {
      return Math.round(
        (this.mediaTime -
          (this.enableStartPtsIgnoreEditList ? this.timeOffset : 0) -
          this.debugTimeOffset) *
          this.fps,
      );
    }
    set frameIndex(value) {
      this.setVideoTime(value / this.fps);
    }
    isInAdFrame(frameIndex) {
      if (!this.overlays) return false;
      const frameOverlays = this.overlays.elements.get(frameIndex);
      const nextFrameOverlays = this.overlays.elements.get(frameIndex + 1);
      return (
        (frameOverlays !== undefined && frameOverlays.length > 0) ||
        (nextFrameOverlays !== undefined && nextFrameOverlays.length > 0)
      );
    }
    sendImpression(adSlotIndex, frameCount, scaledFrameCount) {
      if (!this.impressionService) return;
      const adSlot = this.overlays?.adSlots.get(adSlotIndex);
      if (!adSlot) return;
      this.impressionService.uploadImpression(adSlot.adProductId, {
        adId: adSlot.adId,
        adSlotId: adSlot.adSlotId,
        imageId: adSlot.id,
        scaledFrameCount,
        frameCount,
      });
    }
    handleAdFrameTransition(frameIndex) {
      const frameOverlays = this.overlays?.elements.get(frameIndex) ?? [];
      const currentAdSlotIndices = new Set(
        frameOverlays.map((overlay) => String(overlay.id)),
      );
      const lastIndex = this.lastFrameIndex;
      if (lastIndex !== null) {
        const delta = frameIndex - lastIndex;
        const isBackwardSeek = delta < -1;
        if (isBackwardSeek) {
          for (const adSlotIndex of this.activeAdSlotIndices) {
            if (currentAdSlotIndices.has(adSlotIndex)) {
              const tracking = this.adFrameTracking.get(adSlotIndex);
              if (tracking && tracking.frameCount > 0) {
                this.sendImpression(
                  adSlotIndex,
                  tracking.frameCount,
                  tracking.scaledFrameCount,
                );
              }
              this.adFrameTracking.set(adSlotIndex, {
                frameCount: 0,
                scaledFrameCount: 0,
              });
            }
          }
        }
      }
      for (const adSlotIndex of this.activeAdSlotIndices) {
        if (!currentAdSlotIndices.has(adSlotIndex)) {
          const tracking = this.adFrameTracking.get(adSlotIndex);
          if (tracking && tracking.frameCount > 0) {
            this.sendImpression(
              adSlotIndex,
              tracking.frameCount,
              tracking.scaledFrameCount,
            );
          }
          this.adFrameTracking.delete(adSlotIndex);
        }
      }
      for (const adSlotIndex of currentAdSlotIndices) {
        if (!this.activeAdSlotIndices.has(adSlotIndex)) {
          this.adFrameTracking.set(adSlotIndex, {
            frameCount: 0,
            scaledFrameCount: 0,
          });
        }
      }
      const speed = this.video.playbackRate;
      for (const adSlotIndex of currentAdSlotIndices) {
        const tracking = this.adFrameTracking.get(adSlotIndex);
        if (tracking) {
          tracking.frameCount += 1;
          tracking.scaledFrameCount += 1 / speed;
        }
      }
      this.activeAdSlotIndices = currentAdSlotIndices;
      this.lastFrameIndex = frameIndex;
    }
    renderFrame = (frameIndex) => {
      this.resizeCanvas();
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      if (this.video.playbackRate > 1) {
        if (this.renderId === null) {
          this.renderId = this.video.requestVideoFrameCallback(this.render);
        }
        return;
      }
      if (this.option.drawVideo && this.isInAdFrame(frameIndex)) {
        this.videoRenderer.draw();
      }
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
      if (this.overlays) {
        const frameOverlays = this.overlays.elements.get(frameIndex) ?? [];
        for (const overlay of frameOverlays) {
          const normalizedOverlay = this.normalizeOverlay(overlay);
          const adSlot = this.overlays.adSlots.get(overlay.id);
          const gifPlayer = this.gifPlayers.get(overlay.id);
          if (adSlot?.mediaType === "gif" && gifPlayer?.isReady) {
            const gifTexture = gifPlayer.getTextureForVideoFrame(
              frameIndex,
              adSlot.startFrame,
              this.fps,
            );
            if (gifTexture) {
              this.overlayRenderer.setOverrideTexture(overlay.id, gifTexture);
            }
          }
          this.overlayRenderer.draw(normalizedOverlay, this.option.drawImage);
          if (adSlot?.mediaType === "gif") {
            this.overlayRenderer.clearOverrideTexture(overlay.id);
          }
        }
      }
      this.gl.disable(this.gl.BLEND);
      if (this.renderId === null) {
        this.renderId = this.video.requestVideoFrameCallback(this.render);
      }
    };
    render = (_now, metadata) => {
      this.renderId = null;
      this.renderCount++;
      this.controlState.metadata = metadata;
      this._mediaTime = metadata.mediaTime;
      const fi = this.frameIndex;
      this.handleAdFrameTransition(fi);
      this.renderFrame(fi);
      if (
        this.loopIndex >= 0 &&
        metadata.mediaTime > this.loopRanges[this.loopIndex][1]
      ) {
        this.video.currentTime = this.loopRanges[this.loopIndex][0];
      }
      this.controlState = {
        isPlaying: true,
        metadata,
        frameIndex: fi,
        duration: this.video.duration,
      };
      this.emitControlStateChanged();
    };
    get layoutManager() {
      return this._layoutManager;
    }
  }

  // src/dev/main.ts
  class VirtualAdsSDK {
    static _instance = null;
    controller = null;
    static create(
      videoElement,
      secretKey,
      userLabel,
      pubVideoId,
      options = {},
    ) {
      if (VirtualAdsSDK._instance) {
        console.warn(
          "VirtualAdsSDK: An active instance already exists. Please call dispose() before creating a new one.",
        );
        return null;
      }
      const {
        enableStartPtsIgnoreEditList = false,
        enablePackage = true,
        canvasObjectFitMode = "contain",
      } = options;
      if (!enablePackage) {
        return null;
      }
      const handler = new VirtualAdsSDK();
      console.log("Virtual Ads SDK loaded.");
      let canvasElement = document.getElementById("player-canvas");
      if (!canvasElement) {
        canvasElement = document.createElement("canvas");
        canvasElement.id = "player-canvas";
        const parent = videoElement.parentElement;
        if (parent) {
          parent.appendChild(canvasElement);
        }
        Object.assign(canvasElement.style, {
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          objectFit: canvasObjectFitMode,
        });
      }
      const option = {
        drawVideo: true,
        drawImage: true,
        fps: 25,
      };
      handler.controller = new VideoOverlayController(
        videoElement,
        canvasElement,
        option,
        secretKey,
        userLabel,
        pubVideoId,
        enableStartPtsIgnoreEditList,
      );
      VirtualAdsSDK._instance = handler;
      return handler;
    }
    static dispose() {
      if (VirtualAdsSDK._instance) {
        VirtualAdsSDK._instance.controller?.dispose();
        VirtualAdsSDK._instance.controller = null;
        VirtualAdsSDK._instance = null;
      }
    }
  }
  globalThis.VirtualAdsSDK = VirtualAdsSDK;
  window.VirtualAdsSDK = VirtualAdsSDK;
})();
