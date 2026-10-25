import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import QRCode from "react-native-qrcode-svg";
import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Fraunces_500Medium } from "@expo-google-fonts/fraunces/500Medium";
import { Fraunces_500Medium_Italic } from "@expo-google-fonts/fraunces/500Medium_Italic";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Coffee,
  ExternalLink,
  Headphones,
  Home,
  ImagePlus,
  LampDesk,
  Leaf,
  Link2,
  Package,
  Plus,
  QrCode,
  ScanLine,
  Settings2,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store as StoreIcon,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react-native";
import {
  api,
  API_URL,
  loadSession,
  clearSession,
  saveSession,
  money,
  type Session,
  type SellerStores,
  type DraftItem,
  type Store,
  type StoreSummary,
  type StoreSnapshot,
  type Integration,
  type Comparison,
} from "./lib/api";
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
  medium: "DMSans_500Medium",
  semi: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
  serif: "Fraunces_500Medium",
  italic: "Fraunces_500Medium_Italic",
};
type Tab = "home" | "store" | "connections";
export default function App() {
  const [loaded, error] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Fraunces_500Medium,
    Fraunces_500Medium_Italic,
  });
  if (!loaded && !error)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.paper,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={C.green} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SellerApp />
    </SafeAreaProvider>
  );
}
function SellerApp() {
  const [tab, setTab] = useState<Tab>("home"),
    [session, setSession] = useState<Session | null>(null),
    [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null),
    [drafts, setDrafts] = useState<DraftItem[]>([]),
    [publishLocked, setPublishLocked] = useState(false),
    [photo, setPhoto] = useState<string | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [name, setName] = useState("My store"),
    [capture, setCapture] = useState(false),
    [qr, setQr] = useState(false),
    [integrations, setIntegrations] = useState<Integration[]>([]),
    [search, setSearch] = useState(""),
    [publishUrl, setPublishUrl] = useState(""),
    [booted, setBooted] = useState(false),
    [stores, setStores] = useState<StoreSummary[]>([]),
    [storesOpen, setStoresOpen] = useState(false),
    [newStoreName, setNewStoreName] = useState(""),
    [deleteOpen, setDeleteOpen] = useState(false),
    [deleteName, setDeleteName] = useState(""),
    [comparisons, setComparisons] = useState<{
      item: DraftItem;
      rows: Comparison[];
      note: string;
    } | null>(null);
  const publishKey = useRef(""),
    storeKey = useRef(""),
    activeStore = useRef(""),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };
  // Revisions are per store: ignore late responses for a storefront that is no longer open.
  const applySnapshot = useCallback((data: StoreSnapshot) => {
    if (data.store.id !== activeStore.current) return;
    setSnapshot((old) =>
      !old ||
      old.store.id !== data.store.id ||
      data.store.revision >= old.store.revision
        ? data
        : old,
    );
  }, []);
  const loadStores = useCallback(async (token: string) => {
    try {
      setStores(
        (await api<{ stores: StoreSummary[] }>("/stores", token)).stores,
      );
    } catch {
      /* The storefront list is refreshed again on the next pull or switch. */
    }
  }, []);
  const refresh = useCallback(
    async (s = session) => {
      if (s) {
        applySnapshot(
          await api<StoreSnapshot>(`/stores/${s.store.id}`, s.token),
        );
        await loadStores(s.token);
      }
      const h = await api<{ integrations: Integration[] }>("/health");
      setIntegrations(h.integrations);
    },
    [session, applySnapshot, loadStores],
  );
  // Opens one storefront on this device with its own saved draft.
  async function activate(next: Session) {
    const saved = await AsyncStorage.getItem(`draft:${next.store.id}`).catch(
      () => null,
    );
    let draft: {
      items?: DraftItem[];
      photo?: string | null;
      key?: string;
      locked?: boolean;
    } | null = null;
    try {
      draft = saved ? JSON.parse(saved) : null;
    } catch {}
    activeStore.current = next.store.id;
    setSession(next);
    setName(next.store.name);
    setSnapshot(null);
    setPublishUrl("");
    setSearch("");
    setDrafts(draft?.items || []);
    setPhoto(draft?.photo || null);
    publishKey.current = draft?.key || "";
    setPublishLocked(Boolean(draft?.locked));
    await saveSession(next);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await loadSession();
        if (!active) return;
        if (saved) {
          const current = await api<SellerStores>("/auth/session", saved.token);
          const next = {
            token: saved.token,
            store:
              current.stores.find((s) => s.id === saved.store.id) ||
              current.store,
          };
          setStores(current.stores);
          await activate(next);
          await refresh(next);
        } else {
          const h = await api<{ integrations: Integration[] }>("/health");
          if (active) setIntegrations(h.integrations);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to restore your store.",
          );
        if (
          (e as { status?: number }).status === 401 ||
          (e as { status?: number }).status === 410
        )
          await clearSession();
      } finally {
        if (active) setBooted(true);
      }
    })();
    return () => {
      active = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!session || !booted) return;
    void AsyncStorage.setItem(
      `draft:${session.store.id}`,
      JSON.stringify({
        items: drafts,
        photo,
        key: publishKey.current,
        locked: publishLocked,
      }),
    );
  }, [drafts, photo, session, booted, publishLocked]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const update = (data: StoreSnapshot) => {
      if (active) applySnapshot(data);
    };
    const interval = setInterval(
      () =>
        api<StoreSnapshot>(`/stores/${session.store.id}`, session.token)
          .then(update)
          .catch(() => {}),
      3000,
    );
    let client: ConvexClient | undefined;
    let unsubscribe: (() => void) | undefined;
    if (process.env.EXPO_PUBLIC_CONVEX_URL) {
      client = new ConvexClient(process.env.EXPO_PUBLIC_CONVEX_URL);
      unsubscribe = client.onUpdate(
        makeFunctionReference<"query">("inventory:watch"),
        { storeId: session.store.id },
        (value) => {
          if (value) {
            // Public realtime events invalidate the authenticated seller snapshot.
            void api<StoreSnapshot>(
              `/stores/${session.store.id}`,
              session.token,
            )
              .then(update)
              .catch(() => {});
          }
        },
      );
    }
    return () => {
      active = false;
      clearInterval(interval);
      unsubscribe?.();
      void client?.close();
    };
  }, [session, applySnapshot]);
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      if (
        (e as { status?: number }).status === 401 ||
        (e as { status?: number }).status === 410
      ) {
        setSession(null);
        await clearSession();
      }
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error,
      ).catch(() => {});
    } finally {
      setBusy("");
    }
  }
  async function signIn() {
    await run("Signing in", async () => {
      const next = await api<Session>("/auth/login", undefined, {
        email: email.trim(),
        password,
      });
      await activate({ token: next.token, store: next.store });
      setPassword("");
      await refresh(next);
    });
  }
  async function switchStore(next: Store) {
    setStoresOpen(false);
    if (!session || next.id === session.store.id) return;
    await run("Opening your storefront", async () => {
      const s = { token: session.token, store: next };
      await activate(s);
      await refresh(s);
      notify(`Now managing ${next.name}.`);
    });
  }
  async function openStore() {
    if (!session || newStoreName.trim().length < 2) return;
    setStoresOpen(false);
    await run("Opening a new storefront", async () => {
      // One key per intended storefront, so a retried request cannot create a duplicate.
      storeKey.current ||= Crypto.randomUUID();
      const result = await api<SellerStores>("/stores", session.token, {
        name: newStoreName.trim(),
        requestKey: storeKey.current,
      });
      storeKey.current = "";
      setNewStoreName("");
      setStores(result.stores);
      const s = { token: session.token, store: result.store };
      await activate(s);
      setTab("store");
      await refresh(s);
      notify(`${result.store.name} is ready for its first finds.`);
    });
  }
  async function deleteStore() {
    if (!session || deleteName.trim() !== session.store.name) return;
    const gone = session.store;
    setDeleteOpen(false);
    await run("Deleting this storefront", async () => {
      let result: SellerStores;
      try {
        result = await api<SellerStores>(
          `/stores/${gone.id}`,
          session.token,
          { name: deleteName.trim() },
          "DELETE",
        );
      } catch (e) {
        // A retry after a lost response finds the storefront already gone.
        if ((e as { status?: number }).status !== 404) throw e;
        result = await api<SellerStores>("/auth/session", session.token);
      }
      await AsyncStorage.removeItem(`draft:${gone.id}`).catch(() => {});
      setDeleteName("");
      setStores(result.stores);
      const next = { token: session.token, store: result.store };
      await activate(next);
      setTab("home");
      await refresh(next);
      notify(`${gone.name} was deleted.`);
    });
  }
  async function signOut() {
    await run("Signing out", async () => {
      if (session) await api("/auth/logout", session.token, {});
      await clearSession();
      activeStore.current = "";
      setSession(null);
      setStores([]);
      setSnapshot(null);
      setDrafts([]);
      setPublishLocked(false);
      setPhoto(null);
      setTab("home");
    });
  }
  async function ensureStore() {
    if (!session) throw new Error("Sign in before adding items.");
    return session;
  }
  async function pick(camera: boolean) {
    setCapture(false);
    await run(
      camera ? "Opening your camera" : "Opening your photos",
      async () => {
        if (camera) {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            throw new Error(
              "Camera access is off. Enable it in your device settings, or choose a photo from your library.",
            );
          }
        }
        const options: ImagePicker.ImagePickerOptions = {
          mediaTypes: ["images"],
          quality: 0.85,
          allowsEditing: false,
        };
        const result = camera
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled) return;
        setBusy("Claude is taking a closer look");
        const asset = result.assets[0];
        const processed = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: Math.min(asset.width, 1568) } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        );
        const s = await ensureStore();
        const form = new FormData();
        if (Platform.OS === "web") {
          form.append(
            "photo",
            await (await fetch(processed.uri)).blob(),
            "table.jpg",
          );
        } else {
          form.append("photo", {
            uri: processed.uri,
            name: "table.jpg",
            type: "image/jpeg",
          } as unknown as Blob);
        }
        const r = await api<{ items: DraftItem[]; message: string }>(
          `/scan?storeId=${s.store.id}`,
          s.token,
          form,
        );
        if (!r.items.length) throw new Error(r.message);
        setDrafts(r.items);
        setPhoto(processed.uri);
        publishKey.current = Crypto.randomUUID();
        scroll.current?.scrollTo({ y: 0, animated: true });
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      },
    );
  }
  function edit(id: string, patch: Partial<DraftItem>) {
    if (publishLocked || busy) return;
    setDrafts((old) => old.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    publishKey.current = Crypto.randomUUID();
  }
  async function publish() {
    await run("Opening your little store", async () => {
      if (!session) return;
      setPublishLocked(true);
      try {
        const result = await api<StoreSnapshot & { url: string }>(
          "/publish",
          session.token,
          {
            storeId: session.store.id,
            requestKey: publishKey.current,
            items: drafts,
          },
        );
        setPublishLocked(false);
        setSnapshot(result);
        setPublishUrl(result.url);
        setDrafts([]);
        void loadStores(session.token);
        setTab("store");
        setQr(true);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      } catch (e) {
        if (
          [400, 401, 403, 503].includes((e as { status?: number }).status || 0)
        )
          setPublishLocked(false);
        throw e;
      }
    });
  }
  const storeUrl =
    publishUrl || (session ? `${API_URL}/s/${session.store.id}` : "");
  async function share() {
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(storeUrl);
        notify("Store link copied.");
      } else
        await Share.share({
          message: `A few good things, looking for a new home. Shop ${snapshot?.store.name || name}: ${storeUrl}`,
          url: storeUrl,
        });
    } catch {
      setError("Couldn't open sharing. Use Copy link instead.");
    }
  }
  async function rename() {
    await run("Saving your store name", async () => {
      if (!session) {
        notify("Your store name is ready.");
        return;
      }
      const data = await api<StoreSnapshot>(
        `/stores/${session.store.id}`,
        session.token,
        { name },
        "PATCH",
      );
      setSnapshot(data);
      const s = { ...session, store: data.store };
      setSession(s);
      setStores((list) =>
        list.map((x) => (x.id === data.store.id ? { ...x, ...data.store } : x)),
      );
      await saveSession(s);
      notify("Your store has a new name.");
    });
  }
  const total = drafts.reduce((s, d) => s + d.price * d.quantity, 0),
    available = snapshot?.items.reduce((s, i) => s + i.available, 0) || 0;
  const published = snapshot?.items.length || 0;
  const valid =
    drafts.length > 0 &&
    drafts.every(
      (d) =>
        d.name.trim().length >= 2 &&
        Number.isFinite(d.price) &&
        d.price >= 0.5 &&
        d.price <= 10000 &&
        Number.isInteger(d.quantity) &&
        d.quantity >= 1 &&
        d.quantity <= 100,
    );
  function exitReview() {
    if (publishLocked) {
      setError(
        "Retry publishing to confirm your listings before changing this draft.",
      );
      return;
    }
    if (Platform.OS === "web") {
      setDrafts([]);
      return;
    }
    Alert.alert(
      "Save this for later?",
      "Your draft stays on this device until you publish or start a new scan.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard draft",
          style: "destructive",
          onPress: () => setDrafts([]),
        },
      ],
    );
  }
  if (!booted)
    return (
      <SafeAreaView
        style={[s.safe, { justifyContent: "center", alignItems: "center" }]}
      >
        <ActivityIndicator color={C.green} />
      </SafeAreaView>
    );
  if (!session)
    return (
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              s.scroll,
              { flexGrow: 1, justifyContent: "center" },
            ]}
          >
            <View style={s.emptyIcon}>
              <StoreIcon size={38} color={C.green} />
            </View>
            <Eyebrow text="YOUR BUSINESS, WITH YOU" />
            <Text style={s.title}>
              Welcome<Text style={s.italic}> back.</Text>
            </Text>
            <Text style={s.subtitle}>
              Sign in to photograph, price, and sell your finds.
            </Text>
            <View style={s.settingCard}>
              <Text style={s.fieldLabel}>EMAIL</Text>
              <TextInput
                style={[
                  s.storeNameInput,
                  { fontFamily: F.regular, fontSize: 16, minWidth: 0 },
                ]}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                accessibilityLabel="Email"
              />
              <Text style={s.fieldLabel}>PASSWORD</Text>
              <TextInput
                style={[
                  s.storeNameInput,
                  { fontFamily: F.regular, fontSize: 16, minWidth: 0 },
                ]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                accessibilityLabel="Password"
                onSubmitEditing={() => void signIn()}
              />
            </View>
            {!!error && (
              <Text
                style={{ color: "#a43f25", marginBottom: 18 }}
                accessibilityRole="alert"
              >
                {error}
              </Text>
            )}
            <Button
              label={busy || "Sign in"}
              icon={<ArrowRight size={19} color="white" />}
              onPress={() => void signIn()}
              disabled={!!busy || !email.trim() || !password}
            />
            <Text style={[s.tiny, { textAlign: "center", marginTop: 20 }]}>
              Use the seller account configured for your store. Contact your
              store administrator if you need access.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.topBar}>
          <View style={s.brand}>
            <View style={s.brandMark}>
              <ScanLine size={22} color={C.paper} />
            </View>
            <Text style={s.brandText}>
              snap<Text style={s.brandA}>a</Text>store
              <Text style={{ color: C.orange }}>·</Text>
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Storefront: ${session.store.name}. Switch or add a storefront`}
            onPress={() => {
              setStoresOpen(true);
              void loadStores(session.token);
            }}
            disabled={drafts.length > 0 || !!busy}
            style={s.storePill}
          >
            <View style={s.avatar}>
              <Text style={s.avatarText}>{session.store.name.slice(0, 1)}</Text>
            </View>
            <Text style={s.storePillText} numberOfLines={1}>
              {session.store.name}
            </Text>
            {drafts.length === 0 && <ChevronDown size={15} color={C.muted} />}
          </Pressable>
        </View>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.scroll}
          refreshControl={
            <RefreshControl
              refreshing={busy === "Refreshing your store"}
              tintColor={C.green}
              onRefresh={() =>
                void run("Refreshing your store", () => refresh())
              }
            />
          }
        >
          {!!error && (
            <View accessibilityRole="alert" style={s.error}>
              <CircleHelp size={18} color="#913e2b" />
              <Text style={s.errorText}>{error}</Text>
              <Pressable
                accessibilityLabel="Dismiss error"
                onPress={() => setError("")}
              >
                <X size={16} color="#913e2b" />
              </Pressable>
            </View>
          )}
          {drafts.length > 0 ? (
            <>
              <Pressable style={s.back} onPress={exitReview} disabled={!!busy}>
                <ArrowLeft size={17} color={C.ink} />
                <Text style={s.smallBold}>Back</Text>
              </Pressable>
              <Eyebrow text="A LITTLE HUMAN TOUCH" />
              <Text style={s.title}>
                Your finds,<Text style={s.italic}> refined.</Text>
              </Text>
              <Text style={s.subtitle}>
                AI made a first pass. You make the final call.
              </Text>
              <View style={s.reviewNotice}>
                <Sparkles size={18} color={C.green} />
                <Text style={s.noticeText}>
                  Identified with Claude. Review every name, price, and
                  quantity. Estimates are a starting point.
                </Text>
              </View>
              {photo && (
                <Image
                  source={{ uri: photo }}
                  style={s.scanPreview}
                  accessibilityLabel="Your scanned table"
                />
              )}
              {drafts.map((d, index) => (
                <View key={d.id} style={s.draftCard}>
                  <View style={s.draftTop}>
                    <Art name={d.name} category={d.category} size={66} />
                    <View style={s.flex}>
                      <Text style={s.category}>
                        {d.category.toUpperCase()} · FIND{" "}
                        {String(index + 1).padStart(2, "0")}
                      </Text>
                      <TextInput
                        style={s.itemInput}
                        value={d.name}
                        onChangeText={(v) => edit(d.id, { name: v })}
                        maxLength={100}
                        accessibilityLabel={`Name of item ${index + 1}`}
                        editable={!busy && !publishLocked}
                      />
                      <View style={s.confidence}>
                        <View
                          style={[
                            s.dot,
                            {
                              backgroundColor:
                                d.confidence < 0.75 ? C.orange : "#73925c",
                            },
                          ]}
                        />
                        <Text style={s.tiny}>
                          {d.confidence < 0.75
                            ? "Needs a closer look"
                            : "Ready for your review"}{" "}
                          · {Math.round(d.confidence * 100)}%
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      accessibilityLabel={`Remove ${d.name}`}
                      onPress={() =>
                        setDrafts((ds) => ds.filter((i) => i.id !== d.id))
                      }
                      style={s.delete}
                      disabled={!!busy || publishLocked}
                    >
                      <Trash2 size={17} color={C.muted} />
                    </Pressable>
                  </View>
                  <View style={s.priceRow}>
                    <View style={s.flex}>
                      <Text style={s.fieldLabel}>YOUR PRICE</Text>
                      <View style={s.priceInputWrap}>
                        <Text style={s.dollar}>$</Text>
                        <TextInput
                          style={s.priceInput}
                          keyboardType="decimal-pad"
                          value={Number.isNaN(d.price) ? "" : String(d.price)}
                          onChangeText={(v) =>
                            edit(d.id, {
                              price:
                                v === "" ? NaN : Number(v.replace(",", ".")),
                            })
                          }
                          accessibilityLabel={`Price for ${d.name}`}
                          editable={!busy && !publishLocked}
                        />
                      </View>
                    </View>
                    <View style={{ width: 95 }}>
                      <Text style={s.fieldLabel}>QUANTITY</Text>
                      <View style={s.quantity}>
                        <Pressable
                          accessibilityLabel={`Decrease quantity of ${d.name}`}
                          onPress={() =>
                            edit(d.id, {
                              quantity: Math.max(1, d.quantity - 1),
                            })
                          }
                          disabled={d.quantity === 1 || !!busy || publishLocked}
                        >
                          <Text style={s.step}>−</Text>
                        </Pressable>
                        <Text style={s.qty}>{d.quantity}</Text>
                        <Pressable
                          accessibilityLabel={`Increase quantity of ${d.name}`}
                          onPress={() =>
                            edit(d.id, {
                              quantity: Math.min(100, d.quantity + 1),
                            })
                          }
                          disabled={
                            d.quantity === 100 || !!busy || publishLocked
                          }
                        >
                          <Plus size={16} color={C.ink} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                  <Text style={s.reason}>{d.reasoning}</Text>
                  <Pressable
                    style={s.comparison}
                    disabled={!!busy}
                    onPress={() =>
                      void run("Finding current asking prices", async () => {
                        const result = await api<{
                          comparisons: Comparison[];
                          note: string;
                        }>("/compare", session!.token, {
                          storeId: session!.store.id,
                          name: d.name,
                        });
                        setComparisons({
                          item: d,
                          rows: result.comparisons,
                          note: result.note,
                        });
                      })
                    }
                  >
                    <TrendingUp size={16} color={C.green} />
                    <Text style={s.smallBold}>Compare market prices</Text>
                    <ArrowUpRight size={15} color={C.green} />
                  </Pressable>
                </View>
              ))}
              <View style={s.reviewTotal}>
                <Text style={s.body}>
                  {drafts.length} finds · total asking value
                </Text>
                <Text style={s.totalValue}>{money(total)}</Text>
              </View>
              <Button
                label={publishLocked ? "Retry publishing" : "Publish my store"}
                icon={<ArrowRight size={19} color="white" />}
                onPress={() => void publish()}
                disabled={!valid || !!busy}
              />
              <View style={s.centerNote}>
                <ShieldCheck size={14} color={C.muted} />
                <Text style={s.tiny}>Payments secured by Square</Text>
              </View>
            </>
          ) : tab === "home" ? (
            <>
              <View style={s.greetingRow}>
                <Eyebrow text="YOUR NEXT LITTLE BEGINNING" />
                <View style={s.dayBadge}>
                  <Leaf size={12} color={C.green} />
                  <Text style={s.badgeText}>Pre-loved. Re-loved.</Text>
                </View>
              </View>
              <Text style={s.title}>
                Hello,<Text style={s.italic}> shopkeeper.</Text>
              </Text>
              <Text style={s.subtitle}>
                Let’s find a new home for your good things.
              </Text>
              <View style={s.hero}>
                <Image
                  source={require("./assets/table.png")}
                  style={s.heroPhoto}
                />
                <View style={s.photoTag}>
                  <ScanLine size={12} color={C.ink} />
                  <Text style={s.photoTagText}>
                    A table full of possibilities
                  </Text>
                </View>
                <View style={s.heroCopy}>
                  <View style={s.heroPill}>
                    <Sparkles size={12} color={C.green} />
                    <Text style={s.heroEyebrow}>FROM TABLE TO STOREFRONT</Text>
                  </View>
                  <Text style={s.heroTitle}>
                    A new life for{`\n`}your{" "}
                    <Text style={s.italic}>good stuff.</Text>
                  </Text>
                  <Text style={s.heroBody}>
                    One photo. A little AI. Your very own store.
                  </Text>
                  <Button
                    label="Snap your first finds"
                    icon={<Camera size={19} color="white" />}
                    onPress={() => setCapture(true)}
                    disabled={!booted || !!busy}
                  />
                </View>
              </View>
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>Your little business</Text>
                <View style={s.statusPill}>
                  <View style={s.dot} />
                  <Text style={s.tiny}>
                    {session?.store.paymentMode === "sandbox"
                      ? "Square sandbox"
                      : "Square payments"}
                  </Text>
                </View>
              </View>
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <View style={s.statLabel}>
                    <TrendingUp size={16} color={C.muted} />
                    <Text style={s.tiny}>Sales</Text>
                  </View>
                  <Text style={s.statNumber}>
                    {money(snapshot?.stats.revenue || 0)}
                  </Text>
                  <Text style={s.statCaption}>A little good adds up</Text>
                </View>
                <View style={[s.stat, { backgroundColor: "#edf0e2" }]}>
                  <View style={s.statLabel}>
                    <Leaf size={16} color={C.muted} />
                    <Text style={s.tiny}>New homes found</Text>
                  </View>
                  <Text style={s.statNumber}>
                    {snapshot?.stats.sold || 0}
                    <Text style={s.statUnit}> items</Text>
                  </Text>
                  <Text style={s.statCaption}>Less stuff. More stories.</Text>
                </View>
              </View>
              {published > 0 ? (
                <>
                  <View style={s.sectionRow}>
                    <Text style={s.sectionTitle}>Fresh from your table</Text>
                    <Pressable onPress={() => setTab("store")}>
                      <Text style={s.smallBold}>View all →</Text>
                    </Pressable>
                  </View>
                  {snapshot!.items.slice(-3).map((i) => (
                    <InventoryRow
                      key={i.id}
                      item={i}
                      onPress={() => void Linking.openURL(storeUrl)}
                    />
                  ))}
                </>
              ) : (
                <View style={s.how}>
                  <Text style={s.sectionTitle}>
                    A small start. So much possibility.
                  </Text>
                  <View style={s.howRow}>
                    {[
                      { icon: Camera, title: "Snap", note: "Find your things" },
                      { icon: Sparkles, title: "Set", note: "Make it yours" },
                      { icon: QrCode, title: "Share", note: "Open for good" },
                    ].map((step, i) => (
                      <View style={s.howStep} key={step.title}>
                        <View style={s.howIcon}>
                          <step.icon size={20} color={C.green} />
                        </View>
                        <Text style={s.howTitle}>
                          {String(i + 1).padStart(2, "0")} {step.title}
                        </Text>
                        <Text style={s.howNote}>{step.note}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              <View style={s.earthNote}>
                <Leaf size={19} color="#879672" />
                <Text style={s.earthText}>
                  Good things deserve a next chapter.
                </Text>
              </View>
            </>
          ) : tab === "store" ? (
            <>
              <Eyebrow text="GOOD FINDS. NEW BEGINNINGS." />
              <Text style={s.title}>
                Your little<Text style={s.italic}> store.</Text>
              </Text>
              <Text style={s.subtitle}>
                {published
                  ? `${available} finds still waiting for their next chapter.`
                  : "Your collection starts with a photo."}
              </Text>
              {published ? (
                <>
                  <View style={s.storeCard}>
                    <View style={s.storeAvatar}>
                      <Text style={s.storeAvatarText}>
                        {snapshot!.store.name.slice(0, 1)}
                      </Text>
                    </View>
                    <Text style={s.storeName}>{snapshot!.store.name}</Text>
                    <Text style={s.storeTagline}>
                      Good finds. New beginnings.
                    </Text>
                    <View style={s.storeActions}>
                      <Pressable
                        style={s.smallButton}
                        onPress={() => setQr(true)}
                      >
                        <QrCode size={17} color={C.green} />
                        <Text style={s.smallBold}>Show QR</Text>
                      </Pressable>
                      <Pressable
                        style={[s.smallButton, { backgroundColor: C.green }]}
                        onPress={() => void share()}
                      >
                        <Share2 size={16} color="white" />
                        <Text style={[s.smallBold, { color: "white" }]}>
                          Share store
                        </Text>
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => void Linking.openURL(storeUrl)}
                      style={s.storeLink}
                    >
                      <Text style={s.tiny}>Preview the buyer experience</Text>
                      <ExternalLink size={12} color={C.muted} />
                    </Pressable>
                  </View>
                  <View style={s.sectionRow}>
                    <Text style={s.sectionTitle}>The collection</Text>
                    <Pressable
                      onPress={() => setCapture(true)}
                      style={s.addLink}
                    >
                      <Plus size={16} color={C.green} />
                      <Text style={s.smallBold}>Add finds</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={s.searchInput}
                    placeholder="Find something in your collection"
                    placeholderTextColor={C.muted}
                    value={search}
                    onChangeText={setSearch}
                    accessibilityLabel="Search your collection"
                  />
                  {snapshot!.items
                    .filter((i) =>
                      i.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((i) => (
                      <InventoryRow
                        key={i.id}
                        item={i}
                        onPress={() => void Linking.openURL(storeUrl)}
                      />
                    ))}
                  {snapshot!.activity.length > 0 && (
                    <>
                      <View style={s.sectionRow}>
                        <Text style={s.sectionTitle}>Little moments</Text>
                        <View style={s.statusPill}>
                          <View style={s.dot} />
                          <Text style={s.tiny}>Live</Text>
                        </View>
                      </View>
                      {snapshot!.activity.slice(0, 5).map((a) => (
                        <View key={a.id} style={s.activity}>
                          <View style={s.activityIcon}>
                            <ArrowDownLeft size={18} color={C.green} />
                          </View>
                          <View style={s.flex}>
                            <Text style={s.activityText}>{a.message}</Text>
                            <Text style={s.tiny}>
                              {new Date(a.at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <View style={s.empty}>
                  <View style={s.emptyIcon}>
                    <StoreIcon size={38} color={C.green} />
                  </View>
                  <Text style={s.emptyTitle}>Something good starts here.</Text>
                  <Text style={s.emptyBody}>
                    Your first few finds are all it takes. We’ll help you turn
                    them into a storefront.
                  </Text>
                  <Button
                    label="Add your first finds"
                    icon={<Camera size={18} color="white" />}
                    onPress={() => setCapture(true)}
                  />
                </View>
              )}
            </>
          ) : (
            <>
              <Eyebrow text="A LITTLE HELP BEHIND THE SCENES" />
              <Text style={s.title}>
                Made for<Text style={s.italic}> more.</Text>
              </Text>
              <Text style={s.subtitle}>
                Useful technology. A more human way to sell.
              </Text>
              <View style={s.settingCard}>
                <Text style={s.fieldLabel}>THIS STOREFRONT’S NAME</Text>
                <TextInput
                  style={s.storeNameInput}
                  value={name}
                  onChangeText={setName}
                  maxLength={60}
                  accessibilityLabel="Store name"
                />
                <Pressable
                  style={s.saveName}
                  onPress={() => void rename()}
                  disabled={!!busy || name.trim().length < 2}
                >
                  <Text style={s.smallBold}>Save name</Text>
                  <Check size={16} color={C.green} />
                </Pressable>
              </View>
              <View style={[s.settingCard, s.dangerCard]}>
                <Text style={s.fieldLabel}>DELETE THIS STOREFRONT</Text>
                <Text style={s.dangerBody}>
                  Removes its link, QR code, listings, photos, Square catalog
                  items, and this app’s sales record. Payments stay in Square.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={s.saveName}
                  onPress={() => {
                    setDeleteName("");
                    setDeleteOpen(true);
                  }}
                  disabled={!!busy}
                >
                  <Text style={[s.smallBold, { color: C.danger }]}>
                    {snapshot?.store.closing
                      ? "Finish deleting"
                      : "Delete storefront"}
                  </Text>
                  <Trash2 size={16} color={C.danger} />
                </Pressable>
              </View>
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>Your store’s superpowers</Text>
                <Zap size={20} color={C.orange} />
              </View>
              {integrations.map((integration, i) => {
                const Icon =
                  [Sparkles, ShoppingBag, TrendingUp, Headphones, Package][i] ||
                  Zap;
                return (
                  <View key={integration.name} style={s.integration}>
                    <View
                      style={[
                        s.integrationIcon,
                        {
                          backgroundColor: [
                            "#f1dfd3",
                            "#e0e8e1",
                            "#e7eccf",
                            "#e5e0ed",
                            "#f1e4cf",
                          ][i],
                        },
                      ]}
                    >
                      <Icon size={22} color={C.ink} />
                    </View>
                    <View style={s.flex}>
                      <View style={s.integrationTitle}>
                        <Text style={s.integrationName}>
                          {integration.name}
                        </Text>
                        <Text
                          style={[
                            s.integrationStatus,
                            {
                              color:
                                integration.status === "ready"
                                  ? "#58783e"
                                  : C.muted,
                            },
                          ]}
                        >
                          {integration.status === "ready"
                            ? "CONFIGURED"
                            : "NEEDS SETUP"}
                        </Text>
                      </View>
                      <Text style={s.integrationFeature}>
                        {integration.feature}
                      </Text>
                      <Text style={s.integrationDetail}>
                        {integration.detail}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {!integrations.length && (
                <Button
                  label="Check connections"
                  icon={<Link2 size={18} color="white" />}
                  onPress={() =>
                    void run("Checking connections", () => refresh())
                  }
                />
              )}
              <View style={s.privacyCard}>
                <ShieldCheck size={22} color={C.green} />
                <View style={s.flex}>
                  <Text style={s.smallBold}>Your decisions. Always.</Text>
                  <Text style={s.privacyText}>
                    You approve every item and price. API keys stay on the
                    server. Sign in to manage your store from your devices. Card
                    details are handled by Square.
                  </Text>
                </View>
              </View>
              <Pressable
                style={s.secondaryButton}
                onPress={() => void signOut()}
                disabled={!!busy}
              >
                <Text style={s.buttonDark}>Sign out</Text>
              </Pressable>
              <Text style={s.serverNote}>
                Server: {API_URL}
                {`\n`}Setup instructions are in the project README. Configured
                integrations still need live verification.
              </Text>
            </>
          )}
        </ScrollView>
        {!drafts.length && (
          <View style={s.nav}>
            <Nav
              icon={Home}
              label="Home"
              selected={tab === "home"}
              onPress={() => setTab("home")}
            />
            <Nav
              icon={StoreIcon}
              label="My store"
              selected={tab === "store"}
              onPress={() => setTab("store")}
            />
            <Pressable
              accessibilityLabel="Scan items"
              onPress={() => setCapture(true)}
              style={s.scanNav}
            >
              <Camera size={25} color="white" />
            </Pressable>
            <Nav
              icon={Settings2}
              label="Connections"
              selected={tab === "connections"}
              onPress={() => setTab("connections")}
            />
          </View>
        )}
        {!!toast && (
          <View style={s.toast}>
            <Check size={16} color="white" />
            <Text style={s.toastText}>{toast}</Text>
          </View>
        )}
        {!!busy && (
          <View style={s.busyOverlay}>
            <View style={s.busyCard}>
              <ActivityIndicator color={C.green} size="large" />
              <Text style={s.busyTitle}>{busy}…</Text>
              <Text style={s.tiny}>A little care goes a long way.</Text>
            </View>
          </View>
        )}
        <Modal
          transparent
          visible={capture}
          animationType="slide"
          onRequestClose={() => setCapture(false)}
        >
          <View style={s.modalBackground}>
            <Pressable
              style={s.modalDismiss}
              accessibilityLabel="Close photo options"
              onPress={() => setCapture(false)}
            />
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <Eyebrow text="LET’S SEE WHAT YOU’VE GOT" />
              <Text style={s.sheetTitle}>
                A few good<Text style={s.italic}> finds.</Text>
              </Text>
              <Text style={s.sheetBody}>
                Place items together, find good light, and keep the whole table
                in frame.
              </Text>
              <Button
                label="Take a photo"
                icon={<Camera size={20} color="white" />}
                onPress={() => void pick(true)}
              />
              <Pressable
                style={s.secondaryButton}
                onPress={() => void pick(false)}
              >
                <ImagePlus size={19} color={C.green} />
                <Text style={s.buttonDark}>Choose from photos</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal
          transparent
          visible={storesOpen}
          animationType="slide"
          onRequestClose={() => setStoresOpen(false)}
        >
          <KeyboardAvoidingView
            style={s.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={s.modalBackground}>
              <Pressable
                style={s.modalDismiss}
                accessibilityLabel="Close storefronts"
                onPress={() => setStoresOpen(false)}
              />
              <View style={[s.sheet, { maxHeight: "88%" }]}>
                <View style={s.sheetHandle} />
                <Eyebrow text="YOUR STOREFRONTS" />
                <Text style={s.sheetTitle}>
                  Your little<Text style={s.italic}> storefronts.</Text>
                </Text>
                <Text style={s.sheetBody}>
                  Each storefront has its own link, QR code, and collection.
                  Every sale is paid through your Square account.
                </Text>
                <ScrollView
                  style={{ flexGrow: 0 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {stores.map((store) => {
                    const open = store.id === session.store.id;
                    return (
                      <Pressable
                        key={store.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: open }}
                        accessibilityLabel={`${store.name}${open ? ", open now" : ""}`}
                        onPress={() => void switchStore(store)}
                        style={[s.storeRow, open && s.storeRowOpen]}
                      >
                        <View
                          style={[
                            s.avatar,
                            open && {
                              backgroundColor: C.green,
                              borderColor: C.green,
                            },
                          ]}
                        >
                          <Text
                            style={[s.avatarText, open && { color: C.paper }]}
                          >
                            {store.name.slice(0, 1)}
                          </Text>
                        </View>
                        <View style={s.flex}>
                          <Text style={s.storeRowName} numberOfLines={1}>
                            {store.name}
                          </Text>
                          <Text style={s.tiny}>
                            {store.closing
                              ? "Deletion unfinished"
                              : store.listed
                                ? store.available
                                  ? `${store.available} finds available`
                                  : "Sold out"
                                : "No finds yet"}
                          </Text>
                        </View>
                        {open && <Check size={18} color={C.green} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={[s.fieldLabel, { marginTop: 22 }]}>
                  NEW STOREFRONT
                </Text>
                <TextInput
                  style={[s.storeNameInput, { fontSize: 20, marginBottom: 18 }]}
                  value={newStoreName}
                  onChangeText={(v) => {
                    setNewStoreName(v);
                    storeKey.current = "";
                  }}
                  placeholder="Name your storefront"
                  placeholderTextColor={C.muted}
                  maxLength={60}
                  accessibilityLabel="New storefront name"
                  onSubmitEditing={() => void openStore()}
                />
                <Button
                  label="Open a new storefront"
                  icon={<Plus size={18} color="white" />}
                  onPress={() => void openStore()}
                  disabled={newStoreName.trim().length < 2 || !!busy}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <Modal
          transparent
          visible={deleteOpen}
          animationType="slide"
          onRequestClose={() => setDeleteOpen(false)}
        >
          <KeyboardAvoidingView
            style={s.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={s.modalBackground}>
              <Pressable
                style={s.modalDismiss}
                accessibilityLabel="Keep this storefront"
                onPress={() => setDeleteOpen(false)}
              />
              <View style={s.sheet}>
                <View style={s.sheetHandle} />
                <Eyebrow text="DELETE STOREFRONT" />
                <Text style={s.sheetTitle}>
                  Delete<Text style={s.italic}> {session.store.name}?</Text>
                </Text>
                <Text style={s.sheetBody}>
                  This can’t be undone. Its link and QR code stop working, and
                  every listing, photo, and Square catalog item it published is
                  removed, along with this app’s record of its sales. Payments
                  and receipts stay in your Square account.
                  {stores.length < 2
                    ? " Because it is your only storefront, a new empty one opens in its place."
                    : ""}
                </Text>
                <Text style={s.fieldLabel}>
                  TYPE “{session.store.name}” TO CONFIRM
                </Text>
                <TextInput
                  style={[s.storeNameInput, { fontSize: 20, marginBottom: 18 }]}
                  value={deleteName}
                  onChangeText={setDeleteName}
                  placeholder={session.store.name}
                  placeholderTextColor={C.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={60}
                  accessibilityLabel="Type the storefront name to confirm"
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void deleteStore()}
                  disabled={!!busy || deleteName.trim() !== session.store.name}
                  style={({ pressed }) => [
                    s.button,
                    { backgroundColor: C.danger },
                    (!!busy || deleteName.trim() !== session.store.name) && {
                      opacity: 0.5,
                    },
                    pressed && { transform: [{ scale: 0.985 }] },
                  ]}
                >
                  <Text style={s.buttonText}>Delete forever</Text>
                  <Trash2 size={18} color="white" />
                </Pressable>
                <Pressable
                  style={s.secondaryButton}
                  onPress={() => setDeleteOpen(false)}
                >
                  <Text style={s.buttonDark}>Keep this storefront</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <Modal
          transparent
          visible={qr}
          animationType="fade"
          onRequestClose={() => setQr(false)}
        >
          <View style={s.qrBackdrop}>
            <View style={s.qrCard}>
              <Pressable
                style={s.qrClose}
                accessibilityLabel="Close QR code"
                onPress={() => setQr(false)}
              >
                <X size={22} color={C.muted} />
              </Pressable>
              <View style={s.qrLeaf}>
                <Leaf size={25} color={C.green} />
              </View>
              <Eyebrow text="YOU’RE OPEN FOR GOOD" />
              <Text style={s.qrTitle}>{snapshot?.store.name || name}</Text>
              <Text style={s.qrBody}>Scan to find something with a story.</Text>
              <View style={s.qrCode}>
                {!!storeUrl && (
                  <QRCode
                    value={storeUrl}
                    size={210}
                    color={C.ink}
                    backgroundColor="#ffffff"
                  />
                )}
              </View>
              <Text style={s.qrFootnote}>Secure checkout with Square</Text>
              <Button
                label="Share my store"
                icon={<Share2 size={18} color="white" />}
                onPress={() => void share()}
              />
              <Pressable
                style={s.secondaryAction}
                onPress={() =>
                  void Clipboard.setStringAsync(storeUrl).then(() =>
                    notify("Store link copied."),
                  )
                }
              >
                <Link2 size={16} color={C.green} />
                <Text style={s.smallBold}>Copy store link</Text>
              </Pressable>
              <Text style={s.qrNetwork}>
                Keep your store online so people can browse and buy from this
                code.
              </Text>
            </View>
          </View>
        </Modal>
        <Modal
          transparent
          visible={!!comparisons}
          animationType="slide"
          onRequestClose={() => setComparisons(null)}
        >
          <View style={s.modalBackground}>
            <Pressable
              style={s.modalDismiss}
              accessibilityLabel="Close price comparisons"
              onPress={() => setComparisons(null)}
            />
            <View style={[s.sheet, { maxHeight: "80%" }]}>
              <View style={s.sheetHandle} />
              <Text style={s.sheetTitle}>
                A little price<Text style={s.italic}> perspective.</Text>
              </Text>
              <Text style={s.sheetBody}>{comparisons?.note}</Text>
              <ScrollView>
                {comparisons?.rows.length ? (
                  comparisons.rows.map((c) => (
                    <Pressable
                      key={c.url}
                      style={s.comparisonRow}
                      onPress={() => void Linking.openURL(c.url)}
                    >
                      <View style={s.flex}>
                        <Text style={s.comparisonName}>{c.title}</Text>
                        <Text style={s.tiny}>eBay · active asking price</Text>
                      </View>
                      <Text style={s.comparisonPrice}>{money(c.price)}</Text>
                      <ArrowUpRight size={15} color={C.green} />
                    </Pressable>
                  ))
                ) : (
                  <Text style={s.emptyBody}>
                    No comparable listings found. Use your own judgment for this
                    item.
                  </Text>
                )}
              </ScrollView>
              <Pressable
                style={s.secondaryButton}
                onPress={() => void signOut()}
                disabled={!!busy}
              >
                <Text style={s.buttonDark}>Sign out</Text>
              </Pressable>
              <Text style={s.serverNote}>
                Powered by Apify. Similar listings may differ in condition or
                model.
              </Text>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function Eyebrow({ text }: { text: string }) {
  return <Text style={s.eyebrow}>{text}</Text>;
}
function Button({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        disabled && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.985 }], backgroundColor: C.ink },
      ]}
    >
      <Text style={s.buttonText}>{label}</Text>
      {icon}
    </Pressable>
  );
}
function Nav({
  icon: Icon,
  label,
  selected,
  onPress,
}: {
  icon: typeof Home;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={s.navItem}
    >
      <Icon
        size={21}
        color={selected ? C.green : "#a0a696"}
        strokeWidth={selected ? 2 : 1.6}
      />
      <Text
        style={[s.navLabel, selected && { color: C.green, fontFamily: F.semi }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function Art({
  name,
  category,
  size = 64,
  photoId,
}: {
  name: string;
  category?: string;
  size?: number;
  photoId?: string;
}) {
  if (photoId)
    return (
      <Image
        source={{ uri: `${API_URL}/api/photos/${photoId}` }}
        style={{ width: size, height: size, borderRadius: 12 }}
      />
    );
  const n = name.toLowerCase(),
    Icon = n.includes("mug")
      ? Coffee
      : n.includes("lamp")
        ? LampDesk
        : n.includes("headphone")
          ? Headphones
          : category === "Books"
            ? BookOpen
            : ShoppingBag;
  const bg =
    Icon === Coffee
      ? "#dfe8e8"
      : Icon === LampDesk
        ? "#eee7d2"
        : Icon === BookOpen
          ? "#ecdfd4"
          : "#e1e7d8";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon
        size={size * 0.5}
        strokeWidth={1.35}
        color={
          Icon === Coffee ? "#678a9b" : Icon === LampDesk ? "#ac8f55" : C.green
        }
      />
    </View>
  );
}
function InventoryRow({
  item,
  onPress,
}: {
  item: StoreSnapshot["items"][number];
  onPress: () => void;
}) {
  return (
    <Pressable style={s.inventoryRow} onPress={onPress}>
      <Art name={item.name} category={item.category} photoId={item.photoId} />
      <View style={s.flex}>
        <Text style={s.inventoryName}>{item.name}</Text>
        <View style={s.inventoryStatus}>
          <View
            style={[
              s.dot,
              { backgroundColor: !item.remaining ? "#a6ac99" : C.orange },
            ]}
          />
          <Text style={s.tiny}>
            {!item.remaining
              ? "Found a new home"
              : `${item.available} available${item.remaining > item.available ? " · checkout in progress" : ""}`}
          </Text>
        </View>
      </View>
      <Text style={s.inventoryPrice}>{money(item.price)}</Text>
      <ChevronRight size={17} color="#b4bba8" />
    </Pressable>
  );
}
const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  safe: { flex: 1, backgroundColor: C.paper },
  topBar: {
    height: 72,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  storePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    maxWidth: "55%",
    minHeight: 44,
    paddingLeft: 4,
    paddingRight: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
  },
  storePillText: {
    fontFamily: F.semi,
    fontSize: 12,
    color: C.ink,
    flexShrink: 1,
  },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 6,
  },
  storeRowOpen: { backgroundColor: "#e9eddf", borderColor: "#d9dfcb" },
  storeRowName: {
    fontFamily: F.semi,
    fontSize: 14,
    color: C.ink,
    marginBottom: 2,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    fontFamily: F.bold,
    fontSize: 23,
    letterSpacing: -1,
    color: C.ink,
  },
  brandA: { fontFamily: F.regular, fontSize: 19 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#e7ebdc",
    borderWidth: 1,
    borderColor: "#d9dfcb",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: F.serif, fontSize: 17, color: C.green },
  scroll: { padding: 23, paddingBottom: 35 },
  greetingRow: { gap: 13, marginBottom: 12 },
  eyebrow: {
    fontFamily: F.semi,
    fontSize: 9,
    letterSpacing: 1.45,
    color: C.muted,
  },
  dayBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#edf0e4",
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 20,
  },
  badgeText: { fontFamily: F.medium, fontSize: 9, color: C.green },
  title: {
    fontFamily: F.serif,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -1.2,
    color: C.ink,
    marginTop: 6,
  },
  italic: { fontFamily: F.italic, color: "#778b60" },
  subtitle: {
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 19,
    color: C.muted,
    marginTop: 6,
    marginBottom: 25,
  },
  hero: {
    borderRadius: 21,
    overflow: "hidden",
    backgroundColor: "#e9edde",
    borderWidth: 1,
    borderColor: "#e2e6d6",
  },
  heroPhoto: { width: "100%", height: 185, resizeMode: "cover" },
  photoTag: {
    position: "absolute",
    top: 15,
    left: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fffdf3e8",
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  photoTagText: { fontFamily: F.medium, fontSize: 8, color: C.ink },
  heroCopy: { padding: 24 },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroEyebrow: {
    fontFamily: F.semi,
    fontSize: 8,
    letterSpacing: 1.2,
    color: C.green,
  },
  heroTitle: {
    fontFamily: F.serif,
    fontSize: 38,
    lineHeight: 41,
    letterSpacing: -1.4,
    color: C.ink,
    marginTop: 16,
  },
  heroBody: {
    fontFamily: F.regular,
    fontSize: 11,
    color: C.muted,
    lineHeight: 18,
    marginTop: 11,
    marginBottom: 20,
  },
  button: {
    backgroundColor: C.green,
    minHeight: 53,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  buttonText: { fontFamily: F.semi, fontSize: 13, color: "white" },
  buttonDark: { fontFamily: F.semi, fontSize: 13, color: C.green },
  secondaryAction: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    paddingVertical: 14,
    marginTop: 2,
    minHeight: 44,
  },
  smallBold: { fontFamily: F.semi, fontSize: 11, color: C.green },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 29,
    marginBottom: 15,
  },
  sectionTitle: {
    fontFamily: F.serif,
    fontSize: 20,
    letterSpacing: -0.4,
    color: C.ink,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: "#edf0e5",
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#77935e" },
  tiny: { fontFamily: F.regular, fontSize: 9, lineHeight: 14, color: C.muted },
  statsRow: { flexDirection: "row", gap: 12 },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 16,
    backgroundColor: C.white,
  },
  statLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  statNumber: {
    fontFamily: F.serif,
    fontSize: 34,
    lineHeight: 44,
    letterSpacing: -1,
    color: C.ink,
    marginTop: 13,
  },
  statUnit: {
    fontFamily: F.regular,
    fontSize: 10,
    letterSpacing: 0,
    color: C.muted,
  },
  statCaption: {
    fontFamily: F.regular,
    fontSize: 8,
    color: C.muted,
    marginTop: 2,
  },
  how: { marginTop: 28, paddingVertical: 9 },
  howRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 20,
  },
  howStep: { flex: 1, alignItems: "center" },
  howIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9eddf",
    marginBottom: 12,
  },
  howTitle: { fontFamily: F.semi, fontSize: 11, color: C.ink },
  howNote: { fontFamily: F.regular, fontSize: 8, color: C.muted, marginTop: 6 },
  earthNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  earthText: { fontFamily: F.italic, fontSize: 14, color: "#7e8c6c" },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 29 : 14,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.paper,
    gap: 12,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minWidth: 58,
    minHeight: 44,
  },
  navLabel: { fontFamily: F.regular, fontSize: 8, color: "#9aa28f" },
  scanNav: {
    height: 50,
    width: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.green,
    marginTop: -13,
    boxShadow: "0 4px 10px #193d3320",
  },
  error: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#f8e4d8",
    borderRadius: 12,
    padding: 13,
    marginBottom: 18,
  },
  errorText: {
    flex: 1,
    fontFamily: F.regular,
    fontSize: 11,
    lineHeight: 17,
    color: "#913e2b",
  },
  toast: {
    position: "absolute",
    bottom: 100,
    left: 24,
    right: 24,
    backgroundColor: C.ink,
    borderRadius: 13,
    padding: 16,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    zIndex: 5,
  },
  toastText: { fontFamily: F.medium, fontSize: 12, color: "white" },
  busyOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#f8f7f1d9",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  busyCard: {
    alignItems: "center",
    padding: 30,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    margin: 25,
  },
  busyTitle: {
    fontFamily: F.serif,
    fontSize: 21,
    lineHeight: 28,
    textAlign: "center",
    color: C.ink,
    marginTop: 20,
    marginBottom: 8,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 18,
    minHeight: 30,
  },
  reviewNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#e9eddf",
    marginBottom: 19,
  },
  noticeText: {
    flex: 1,
    fontFamily: F.regular,
    fontSize: 10,
    lineHeight: 16,
    color: "#5f7053",
  },
  scanPreview: {
    width: "100%",
    height: 175,
    borderRadius: 14,
    marginBottom: 16,
  },
  draftCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 15,
    padding: 17,
    marginBottom: 14,
  },
  draftTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  category: {
    fontFamily: F.medium,
    fontSize: 8,
    letterSpacing: 0.6,
    color: C.muted,
  },
  itemInput: {
    fontFamily: F.semi,
    fontSize: 14,
    color: C.ink,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    minHeight: 40,
  },
  confidence: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  delete: { position: "absolute", top: -8, right: -10, padding: 6 },
  priceRow: { flexDirection: "row", gap: 15, marginTop: 19 },
  fieldLabel: {
    fontFamily: F.semi,
    fontSize: 8,
    letterSpacing: 0.9,
    color: C.muted,
    marginBottom: 8,
  },
  priceInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 9,
    backgroundColor: "white",
    height: 47,
    paddingHorizontal: 13,
  },
  dollar: { fontFamily: F.medium, fontSize: 17, color: C.ink },
  priceInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: F.medium,
    fontSize: 18,
    color: C.ink,
    padding: 8,
    minHeight: 44,
  },
  quantity: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 9,
    height: 47,
    backgroundColor: "white",
  },
  step: { fontFamily: F.medium, fontSize: 23, color: C.green, padding: 3 },
  qty: { fontFamily: F.medium, fontSize: 15, color: C.ink },
  reason: {
    fontFamily: F.regular,
    fontSize: 10,
    lineHeight: 16,
    color: C.muted,
    marginTop: 13,
  },
  comparison: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 12,
    marginTop: 13,
    minHeight: 38,
  },
  reviewTotal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 17,
    marginBottom: 10,
  },
  body: { fontFamily: F.regular, fontSize: 11, color: C.muted },
  totalValue: { fontFamily: F.serif, fontSize: 30, color: C.ink },
  centerNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 15,
  },
  inventoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  inventoryName: {
    fontFamily: F.semi,
    fontSize: 12,
    color: C.ink,
    lineHeight: 18,
  },
  inventoryStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  inventoryPrice: { fontFamily: F.medium, fontSize: 15, color: C.ink },
  storeCard: {
    alignItems: "center",
    backgroundColor: "#e9eddf",
    borderRadius: 19,
    padding: 26,
    borderWidth: 1,
    borderColor: "#e0e6d4",
  },
  storeAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#cedbbd",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  storeAvatarText: { fontFamily: F.serif, fontSize: 29, color: C.green },
  storeName: {
    fontFamily: F.serif,
    fontSize: 28,
    lineHeight: 34,
    color: C.ink,
    textAlign: "center",
    letterSpacing: -0.6,
  },
  storeTagline: {
    fontFamily: F.regular,
    fontSize: 11,
    color: C.muted,
    marginTop: 6,
  },
  storeActions: { flexDirection: "row", gap: 10, marginTop: 22 },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#cdd8bd",
    backgroundColor: "#f6f8ef",
    borderRadius: 10,
    minHeight: 43,
  },
  storeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 17,
  },
  addLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 30,
  },
  searchInput: {
    fontFamily: F.regular,
    fontSize: 11,
    color: C.ink,
    padding: 14,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    marginBottom: 8,
    minHeight: 44,
  },
  activity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#e9eddf",
    alignItems: "center",
    justifyContent: "center",
  },
  activityText: {
    fontFamily: F.medium,
    fontSize: 11,
    color: C.ink,
    marginBottom: 4,
    lineHeight: 16,
  },
  empty: { alignItems: "center", paddingVertical: 40, gap: 16 },
  emptyIcon: {
    width: 90,
    height: 90,
    borderRadius: 28,
    backgroundColor: "#e9eddf",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: F.serif,
    fontSize: 25,
    color: C.ink,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  emptyBody: {
    fontFamily: F.regular,
    fontSize: 12,
    color: C.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 20,
  },
  storeNameInput: {
    fontFamily: F.serif,
    fontSize: 24,
    color: C.ink,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 10,
    minHeight: 48,
  },
  dangerCard: { marginTop: 14, borderColor: "#edc8b8" },
  dangerBody: {
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 19,
    color: C.muted,
  },
  saveName: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-end",
    marginTop: 13,
    minHeight: 28,
  },
  integration: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  integrationIcon: {
    width: 45,
    height: 45,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  integrationTitle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  integrationName: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  integrationStatus: { fontFamily: F.semi, fontSize: 7, letterSpacing: 0.4 },
  integrationFeature: {
    fontFamily: F.medium,
    fontSize: 11,
    color: "#596a52",
    marginTop: 5,
  },
  integrationDetail: {
    fontFamily: F.regular,
    fontSize: 9,
    lineHeight: 15,
    color: C.muted,
    marginTop: 5,
  },
  privacyCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#e9eddf",
    padding: 18,
    borderRadius: 13,
    marginTop: 26,
  },
  privacyText: {
    fontFamily: F.regular,
    fontSize: 10,
    lineHeight: 17,
    color: C.muted,
    marginTop: 6,
  },
  serverNote: {
    fontFamily: F.regular,
    fontSize: 9,
    lineHeight: 16,
    color: C.muted,
    marginTop: 20,
  },
  modalBackground: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#17372c66",
  },
  modalDismiss: { flex: 1 },
  sheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    padding: 27,
    paddingBottom: Platform.OS === "ios" ? 40 : 27,
  },
  sheetHandle: {
    width: 35,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#d3dac7",
    alignSelf: "center",
    marginTop: -12,
    marginBottom: 27,
  },
  sheetTitle: {
    fontFamily: F.serif,
    fontSize: 31,
    lineHeight: 37,
    letterSpacing: -0.9,
    color: C.ink,
    marginTop: 12,
  },
  sheetBody: {
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 20,
    color: C.muted,
    marginTop: 12,
    marginBottom: 23,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#cbd5be",
    borderRadius: 12,
    minHeight: 51,
    padding: 15,
    marginTop: 12,
  },
  qrBackdrop: {
    flex: 1,
    backgroundColor: "#17372c80",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  qrCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    padding: 28,
    backgroundColor: C.paper,
    alignItems: "center",
  },
  qrClose: { position: "absolute", top: 15, right: 15, padding: 5 },
  qrLeaf: {
    width: 53,
    height: 53,
    borderRadius: 27,
    backgroundColor: "#e9eddf",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },
  qrTitle: {
    fontFamily: F.serif,
    fontSize: 29,
    letterSpacing: -0.8,
    color: C.ink,
    marginTop: 12,
    textAlign: "center",
  },
  qrBody: { fontFamily: F.regular, fontSize: 11, color: C.muted, marginTop: 7 },
  qrCode: {
    padding: 20,
    backgroundColor: "white",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.line,
    marginTop: 22,
  },
  qrFootnote: {
    fontFamily: F.medium,
    fontSize: 9,
    color: C.muted,
    marginTop: 13,
    marginBottom: 20,
  },
  qrNetwork: {
    fontFamily: F.regular,
    fontSize: 8,
    lineHeight: 13,
    color: C.muted,
    textAlign: "center",
    maxWidth: 250,
  },
  comparisonRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  comparisonName: {
    fontFamily: F.medium,
    fontSize: 12,
    lineHeight: 18,
    color: C.ink,
    marginBottom: 4,
  },
  comparisonPrice: { fontFamily: F.semi, fontSize: 16, color: C.ink },
});
