import { afterEach, describe, expect, it, vi } from "vitest";
import { installFormDataPatch } from "../mobile/node_modules/expo/src/winter/FormData";
import { convertFormDataAsync } from "../mobile/node_modules/expo/src/winter/fetch/convertFormData";
import { photoForm } from "../mobile/lib/photo-form";

afterEach(() => vi.unstubAllGlobals());

function nativeFormData() {
  // RN owns _parts; Expo patches its methods at startup. Use Expo's actual
  // patch and multipart encoder so Node's different FormData can't hide bugs.
  class RNFormData {
    _parts = [];
  }
  vi.stubGlobal("FormData", installFormDataPatch(RNFormData));
}

describe("Expo photo upload encoding", () => {
  it("reproduces the old URI-only upload failure before any network request", async () => {
    nativeFormData();
    const form = new FormData();
    form.append("photo", {
      uri: "file:///cache/photo.jpg",
      name: "table.jpg",
      type: "image/jpeg",
    });
    await expect(convertFormDataAsync(form)).rejects.toThrow(
      "Unsupported FormDataPart implementation",
    );
  });

  it("preserves native file bytes, MIME type and filename through Expo multipart encoding", async () => {
    nativeFormData();
    const bytes = new Uint8Array([255, 216, 0, 128, 200, 255, 217]);
    // Expo File is a native object implementing Blob, not an instanceof Blob.
    const file = {
      uri: "file:///cache/photo.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
      size: bytes.length,
      bytes: async () => bytes,
    };
    const encoded = await convertFormDataAsync(photoForm(file));
    const parsed = await new Response(encoded.body, {
      headers: {
        "Content-Type": `multipart/form-data; boundary=${encoded.boundary}`,
      },
    }).formData();
    const uploaded = parsed.get("photo");
    expect(uploaded.name).toBe("photo.jpg");
    expect(uploaded.type).toBe("image/jpeg");
    expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(bytes);
  });

  it("also sends browser Blobs and rejects missing or oversized files locally", async () => {
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const request = new Request("https://store.example/api/scan", {
      method: "POST",
      body: photoForm(photo),
    });
    const parsed = await request.formData();
    expect(parsed.get("photo").name).toBe("table.jpg");
    expect(parsed.get("photo").size).toBe(3);
    expect(() => photoForm(new Blob())).toThrow("could not be read");
    expect(() => photoForm({ size: 10 * 1024 * 1024 + 1 })).toThrow("10 MB");
  });
});
