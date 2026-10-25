import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import * as MediaLibrary from "expo-media-library";
import { File, Paths } from "expo-file-system";
import { Check, Copy, Download, ExternalLink, X } from "lucide-react-native";
import { api, API_URL, money } from "../lib/api";
import type {
  Item,
  ListingKit,
  MarketplaceCondition,
  StoreSnapshot,
} from "../../lib/contracts";

const C = {
  paper: "#f8f7f1",
  ink: "#193d33",
  muted: "#77816f",
  line: "#e1e5d8",
  green: "#214c3e",
  lime: "#d9ef9b",
  orange: "#df805e",
  white: "#fffefa",
  danger: "#8b3d28",
};
const F = {
  regular: "DMSans_400Regular",
  semi: "DMSans_600SemiBold",
  serif: "Fraunces_500Medium",
  italic: "Fraunces_500Medium_Italic",
};
const CONDITIONS: MarketplaceCondition[] = [
  "New",
  "Used – Like New",
  "Used – Good",
  "Used – Fair",
];
const MARKETPLACE_CREATE = "https://www.facebook.com/marketplace/create/item";

// Facebook offers no listing API for personal accounts, so this sheet prepares
// everything to paste into Facebook's own form. Buyers then buy on Marketplace,
// and the seller records holds and sales here so the storefront stays accurate.
export function ListingKitSheet({
  storeId,
  token,
  item,
  onClose,
  onSnapshot,
  notify,
}: {
  storeId: string;
  token: string;
  item: Item | null;
  onClose: () => void;
  onSnapshot: (snapshot: StoreSnapshot) => void;
  notify: (message: string) => void;
}) {
  const [kit, setKit] = useState<ListingKit | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [condition, setCondition] = useState<MarketplaceCondition | null>(null),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [link, setLink] = useState(""),
    [quantity, setQuantity] = useState(1);
  const saleKey = useRef("");
  const base = item
    ? `/stores/${storeId}/items/${encodeURIComponent(item.id)}`
    : "";
  function show(next: ListingKit) {
    setKit(next);
    setTitle(next.title);
    setDescription(next.description);
    setCondition(next.condition);
    setLink(next.url || "");
  }
  useEffect(() => {
    setKit(null);
    setError("");
    setQuantity(1);
    setCondition(null);
    saleKey.current = "";
    if (!item) return;
    setLoading(true);
    api<ListingKit>(`${base}/listing`, token)
      .then(show)
      .catch((e: { status?: number; message?: string }) => {
        if (e.status !== 404) setError(e.message || "Please try again.");
      })
      .finally(() => setLoading(false));
  }, [item?.id, token]);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }
  const write = () =>
    run("Writing your listing", async () => {
      show(
        await api<ListingKit>(
          `${base}/listing`,
          token,
          condition ? { condition } : {},
        ),
      );
    });
  const update = (patch: Record<string, unknown>, message?: string) =>
    run("Saving", async () => {
      show(await api<ListingKit>(`${base}/listing`, token, patch, "PATCH"));
      // The listed/closed badge and reminders come from the store snapshot.
      if (patch.status)
        onSnapshot(await api<StoreSnapshot>(`/stores/${storeId}`, token));
      if (message) notify(message);
    });
  async function copy(label: string, value: string) {
    await Clipboard.setStringAsync(value);
    notify(`${label} copied. Paste it into Facebook.`);
  }
  const photoUrl = kit
    ? `${API_URL}/api${base}/listing-photo?v=${encodeURIComponent(kit.updatedAt)}`
    : "";
  const savePhoto = () =>
    run("Saving photo", async () => {
      if (Platform.OS === "web") {
        await Linking.openURL(photoUrl);
        return;
      }
      const permission = await MediaLibrary.requestPermissionsAsync(true, [
        "photo",
      ]);
      if (!permission.granted)
        throw new Error(
          "Allow Snap-a-Store to add photos in Settings to save this listing photo.",
        );
      const file = new File(Paths.cache, `listing-${Date.now()}.jpg`);
      const saved = await File.downloadFileAsync(photoUrl, file);
      await MediaLibrary.Asset.create(saved.uri);
      saved.delete();
      notify("Photo saved. Add it in Facebook from your photos.");
    });
  const inventory = (path: string, payload?: unknown, method?: string) =>
    run("Updating your store", async () => {
      onSnapshot(
        await api<StoreSnapshot>(`${base}/${path}`, token, payload, method),
      );
    });
  if (!item) return null;
  const held = item.held || 0;
  const forSale = item.available + held;
  const needsCondition = !kit && item.condition === "Check condition";
  const dirty = kit && (title !== kit.title || description !== kit.description);
  const sold = item.remaining === 0;
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={s.background}>
        <Pressable
          style={s.dismiss}
          accessibilityLabel="Close the Marketplace listing"
          onPress={onClose}
        />
        <View style={s.sheet}>
          <View style={s.handleRow}>
            <View style={s.handle} />
            <Pressable
              style={s.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
            >
              <X size={18} color={C.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={s.title}>
              List it on<Text style={s.italic}> Marketplace.</Text>
            </Text>
            <Text style={s.body}>
              {item.name} · {money(item.price)} ·{" "}
              {sold
                ? "sold out"
                : `${item.available} in your store${held ? `, ${held} held for Facebook` : ""}`}
            </Text>
            {item.marketplace?.status === "listed" && sold ? (
              <View style={s.reminder}>
                <Text style={s.reminderText}>
                  This sold in your store. Mark the Facebook listing sold too so
                  buyers stop messaging you.
                </Text>
                <Pressable
                  style={s.smallButton}
                  onPress={() =>
                    void update({ status: "closed" }, "Marked as done.")
                  }
                >
                  <Check size={15} color={C.green} />
                  <Text style={s.smallBold}>Done</Text>
                </Pressable>
              </View>
            ) : null}
            {loading ? <ActivityIndicator color={C.green} /> : null}
            {!loading && !kit ? (
              <>
                <Text style={s.body}>
                  Claude writes a clean title and description from this item.
                  The price is always your published price, and the listing
                  sends buyers no links: they buy through Facebook.
                </Text>
                {needsCondition ? (
                  <>
                    <Text style={s.label}>
                      Condition (check the item first)
                    </Text>
                    <View style={s.chips}>
                      {CONDITIONS.map((c) => (
                        <Pressable
                          key={c}
                          style={[s.chip, condition === c && s.chipOn]}
                          accessibilityState={{ selected: condition === c }}
                          onPress={() => setCondition(c)}
                        >
                          <Text
                            style={[
                              s.chipText,
                              condition === c && s.chipTextOn,
                            ]}
                          >
                            {c}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                <Pressable
                  style={[
                    s.button,
                    (needsCondition && !condition) || busy ? s.disabled : null,
                  ]}
                  disabled={(needsCondition && !condition) || !!busy}
                  onPress={() => void write()}
                >
                  <Text style={s.buttonText}>Write my listing</Text>
                </Pressable>
              </>
            ) : null}
            {kit ? (
              <>
                <Image
                  source={{ uri: photoUrl }}
                  style={s.photo}
                  accessibilityLabel={`Listing photo of ${item.name}`}
                />
                <View style={s.row}>
                  <Pressable
                    style={s.smallButton}
                    onPress={() => void savePhoto()}
                  >
                    <Download size={15} color={C.green} />
                    <Text style={s.smallBold}>
                      {Platform.OS === "web" ? "Open photo" : "Save photo"}
                    </Text>
                  </Pressable>
                  {item.box ? (
                    <Pressable
                      style={s.smallButton}
                      onPress={() =>
                        void update({ crop: kit.crop ? null : item.box })
                      }
                    >
                      <Text style={s.smallBold}>
                        {kit.crop ? "Use whole photo" : "Use suggested crop"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Field label="Title" onCopy={() => void copy("Title", title)}>
                  <TextInput
                    style={s.input}
                    value={title}
                    onChangeText={setTitle}
                    maxLength={100}
                    accessibilityLabel="Listing title"
                  />
                </Field>
                <Field
                  label="Price"
                  onCopy={() => void copy("Price", item.price.toFixed(2))}
                >
                  <Text style={s.value}>{money(item.price)}</Text>
                </Field>
                <Field
                  label="Category"
                  onCopy={() => void copy("Category", kit.category)}
                >
                  <Text style={s.value}>{kit.category}</Text>
                </Field>
                <Field label="Condition">
                  <Text style={s.value}>{kit.condition}</Text>
                </Field>
                <Field
                  label="Description"
                  onCopy={() => void copy("Description", description)}
                >
                  <TextInput
                    style={[s.input, s.multiline]}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    maxLength={2000}
                    accessibilityLabel="Listing description"
                  />
                </Field>
                {kit.tags.length ? (
                  <Field
                    label="Tags"
                    onCopy={() => void copy("Tags", kit.tags.join(", "))}
                  >
                    <Text style={s.value}>{kit.tags.join(", ")}</Text>
                  </Field>
                ) : null}
                {kit.warnings.map((w) => (
                  <Text key={w} style={s.warning}>
                    Check: {w}
                  </Text>
                ))}
                <View style={s.row}>
                  {dirty ? (
                    <Pressable
                      style={s.smallButton}
                      onPress={() =>
                        void update({ title, description }, "Listing saved.")
                      }
                    >
                      <Text style={s.smallBold}>Save edits</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={s.smallButton}
                    disabled={!!busy}
                    onPress={() => void write()}
                  >
                    <Text style={s.smallBold}>Rewrite</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={s.button}
                  onPress={() => void Linking.openURL(MARKETPLACE_CREATE)}
                >
                  <ExternalLink size={16} color="white" />
                  <Text style={s.buttonText}>Open Marketplace</Text>
                </Pressable>
                {kit.status === "draft" ? (
                  <>
                    <Text style={s.label}>
                      Listing link (optional, from Facebook's Share menu)
                    </Text>
                    <TextInput
                      style={s.input}
                      value={link}
                      onChangeText={setLink}
                      autoCapitalize="none"
                      keyboardType="url"
                      placeholder="https://www.facebook.com/marketplace/item/…"
                      placeholderTextColor={C.muted}
                      accessibilityLabel="Facebook listing link"
                    />
                    <Pressable
                      style={s.secondary}
                      onPress={() =>
                        void update(
                          { status: "listed", url: link.trim() },
                          "Marked as listed on Facebook.",
                        )
                      }
                    >
                      <Text style={s.secondaryText}>I listed it</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={s.body}>
                    {kit.status === "listed"
                      ? "Listed on Facebook"
                      : "Facebook listing closed"}
                    {kit.url ? " · " : ""}
                    {kit.url ? (
                      <Text
                        style={s.link}
                        onPress={() => void Linking.openURL(kit.url!)}
                      >
                        Open listing
                      </Text>
                    ) : null}
                  </Text>
                )}
              </>
            ) : null}
            {!sold ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>A Facebook buyer?</Text>
                <Text style={s.body}>
                  Hold it while they come to pick it up, so nobody buys it from
                  your store. Mark it sold when they've paid you.
                </Text>
                {forSale > 1 ? (
                  <View style={s.row}>
                    <Pressable
                      style={s.stepper}
                      accessibilityLabel="Fewer"
                      onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                    >
                      <Text style={s.smallBold}>−</Text>
                    </Pressable>
                    <Text style={s.value}>
                      {quantity} of {forSale}
                    </Text>
                    <Pressable
                      style={s.stepper}
                      accessibilityLabel="More"
                      onPress={() =>
                        setQuantity((q) => Math.min(forSale, q + 1))
                      }
                    >
                      <Text style={s.smallBold}>+</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={s.row}>
                  {held ? (
                    <Pressable
                      style={s.smallButton}
                      onPress={() =>
                        void inventory("facebook-hold", undefined, "DELETE")
                      }
                    >
                      <Text style={s.smallBold}>Release hold</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[s.smallButton, !forSale && s.disabled]}
                      disabled={!forSale}
                      onPress={() =>
                        void inventory("facebook-hold", {
                          quantity: Math.min(quantity, forSale),
                        })
                      }
                    >
                      <Text style={s.smallBold}>Hold for Facebook buyer</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[
                      s.smallButton,
                      s.soldButton,
                      !forSale && s.disabled,
                    ]}
                    disabled={!forSale}
                    onPress={() => {
                      saleKey.current ||= Crypto.randomUUID();
                      void run("Updating your store", async () => {
                        onSnapshot(
                          await api<StoreSnapshot>(
                            `${base}/sold-elsewhere`,
                            token,
                            {
                              quantity: Math.min(quantity, forSale),
                              requestKey: saleKey.current,
                            },
                          ),
                        );
                        saleKey.current = "";
                        setQuantity(1);
                        notify("Recorded the Facebook sale.");
                      });
                    }}
                  >
                    <Text style={[s.smallBold, { color: "white" }]}>
                      Sold on Facebook
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {busy ? (
              <View style={s.row}>
                <ActivityIndicator color={C.green} />
                <Text style={s.body}>{busy}…</Text>
              </View>
            ) : null}
            {error ? (
              <Text style={s.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function Field({
  label,
  onCopy,
  children,
}: {
  label: string;
  onCopy?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <View style={s.fieldHead}>
        <Text style={s.label}>{label}</Text>
        {onCopy ? (
          <Pressable
            style={s.copy}
            accessibilityRole="button"
            accessibilityLabel={`Copy ${label.toLowerCase()}`}
            onPress={onCopy}
          >
            <Copy size={13} color={C.green} />
            <Text style={s.smallBold}>Copy</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
const s = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#17372c66",
  },
  dismiss: { flex: 1, minHeight: 40 },
  sheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    maxHeight: "92%",
  },
  handleRow: { alignItems: "center", justifyContent: "center", minHeight: 32 },
  handle: { width: 35, height: 4, borderRadius: 4, backgroundColor: "#d3dac7" },
  close: {
    position: "absolute",
    right: -8,
    top: 0,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: F.serif,
    fontSize: 29,
    lineHeight: 35,
    letterSpacing: -0.8,
    color: C.ink,
  },
  italic: { fontFamily: F.italic },
  body: {
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 19,
    color: C.muted,
    marginTop: 8,
  },
  label: {
    fontFamily: F.semi,
    fontSize: 11,
    color: C.ink,
    marginTop: 14,
    marginBottom: 6,
  },
  value: { fontFamily: F.regular, fontSize: 14, color: C.ink },
  input: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: F.regular,
    fontSize: 14,
    color: C.ink,
  },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  field: { marginTop: 4 },
  fieldHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  copy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 8,
  },
  photo: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: "#e9eddf",
    marginTop: 16,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
  },
  soldButton: { backgroundColor: C.green, borderColor: C.green },
  smallBold: { fontFamily: F.semi, fontSize: 12, color: C.green },
  stepper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.white,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: C.green,
    marginTop: 18,
  },
  buttonText: { fontFamily: F.semi, fontSize: 14, color: "white" },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5be",
    marginTop: 10,
  },
  secondaryText: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  disabled: { opacity: 0.45 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
  },
  chipOn: { backgroundColor: C.green, borderColor: C.green },
  chipText: { fontFamily: F.regular, fontSize: 12, color: C.ink },
  chipTextOn: { color: "white" },
  warning: {
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 18,
    color: C.danger,
    marginTop: 8,
  },
  link: { fontFamily: F.semi, color: C.green },
  card: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    marginTop: 22,
  },
  cardTitle: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  reminder: {
    backgroundColor: "#fbe9e1",
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    gap: 10,
  },
  reminderText: {
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 18,
    color: C.danger,
  },
  error: {
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 18,
    color: C.danger,
    marginTop: 12,
  },
});
