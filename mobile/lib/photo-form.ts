// Expo File implements Blob and exposes bytes(). A legacy { uri, name, type }
// object is not readable by expo/fetch, even when cast to Blob in TypeScript.
export function photoForm(photo: Blob) {
  if (!photo.size)
    throw new Error(
      "This photo could not be read. Take it again or choose another photo.",
    );
  if (photo.size > 10 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 10 MB.");
  const form = new FormData();
  form.append("photo", photo, "table.jpg");
  return form;
}
