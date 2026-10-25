import { ProductEditor } from "./components/product-editor";
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
import { File } from "expo-file-system";
import { photoForm } from "./lib/photo-form";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import QRCode from "react-native-qrcode-svg";
import { federatedSignIn } from "./lib/oauth";
import Svg, { Path } from "react-native-svg";
import { PaymentSetup } from "./components/payment-setup";
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
  ChevronUp,
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
  Pencil,
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
  marketSummary,
} from "./lib/api";
import { C, F, R, T } from "./lib/theme";
type Tab = "home" | "store" | "connections";
const CONDITIONS: DraftItem["condition"][] = [
  "Like new",
  "Good",
  "Fair",
  "Check condition",
];
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
  const [methods, setMethods] = useState({
    google: false,
    apple: false,
    password: true,
  });
  const [tab, setTab] = useState<Tab>("home"),
    [session, setSession] = useState<Session | null>(null),
    [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null),
    [editingItem, setEditingItem] = useState<
      StoreSnapshot["items"][number] | null
    >(null),
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
    [whyOpen, setWhyOpen] = useState<string[]>([]);
  useEffect(() => {
    setEditingItem(null);
  }, [session?.store.id]);
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
    void api<{ google: boolean; apple: boolean; password: boolean }>(
      "/auth/methods",
    )
      .then((m) => {
        if (active) setMethods(m);
      })
      .catch(() => {});
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
  async function signInWith(provider: "google" | "apple") {
    const name = provider === "google" ? "Google" : "Apple";
    await run(`Signing in with ${name}`, async () => {
      const result = await federatedSignIn(provider);
      if (!result) return;
      const next = { token: result.token, store: result.store };
      await activate(next);
      setPassword("");
      await refresh(next);
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
        setBusy("Identifying and pricing your items");
        const asset = result.assets[0];
        const processed = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: Math.min(asset.width, 1568) } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        );
        const s = await ensureStore();
        const upload =
          Platform.OS === "web"
            ? await (await fetch(processed.uri)).blob()
            : new File(processed.uri);
        const form = photoForm(upload);
        // Scans can include a market-price lookup and a second Claude pass.
        const r = await api<{ items: DraftItem[]; message: string }>(
          `/scan?storeId=${s.store.id}`,
          s.token,
          form,
          undefined,
          240000,
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
            <View style={[s.emptyIcon, { marginBottom: 24 }]}>
              <StoreIcon size={40} color={C.green} />
            </View>
            <Eyebrow text="YOUR BUSINESS, WITH YOU" />
            <Text style={s.title}>
              Welcome<Text style={s.italic}> back.</Text>
            </Text>
            <Text style={s.subtitle}>
              Sign in or create your own store to photograph, price, and sell
              your finds.
            </Text>
            {methods.password && (
              <View style={[s.settingCard, { marginBottom: 16 }]}>
                <Text style={s.fieldLabel}>EMAIL</Text>
                <TextInput
                  style={[s.storeNameInput, s.fieldInput]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={C.quiet}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  accessibilityLabel="Email"
                />
                <Text style={s.fieldLabel}>PASSWORD</Text>
                <TextInput
                  style={[s.storeNameInput, s.fieldInput]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Your password"
                  placeholderTextColor={C.quiet}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  accessibilityLabel="Password"
                  onSubmitEditing={() => void signIn()}
                />
              </View>
            )}
            {!!error && (
              <Text
                style={s.inlineError}
                accessibilityRole="alert"
              >
                {error}
              </Text>
            )}
            {methods.password && (
              <Button
                label={busy || "Sign in"}
                icon={<ArrowRight size={19} color="white" />}
                onPress={() => void signIn()}
                disabled={!!busy || !email.trim() || !password}
              />
            )}
            {methods.password && (
              <Text
                style={[
                  s.tiny,
                  { textAlign: "center", marginTop: 20, marginBottom: 12 },
                ]}
              >
                or continue with
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              style={[
                s.secondaryButton,
                {
                  backgroundColor: "#fff",
                  borderColor: "#747775",
                  flexDirection: "row",
                  gap: 12,
                  marginBottom: 20,
                },
              ]}
              onPress={() => void signInWith("google")}
              disabled={!!busy || !methods.google}
            >
              <Image
                source={require("./assets/google.png")}
                style={{ width: 20, height: 20 }}
              />
              <Text style={s.buttonDark}>
                {methods.google
                  ? "Continue with Google"
                  : "Google sign-in unavailable"}
              </Text>
            </Pressable>
            {methods.apple && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue with Apple"
                style={[
                  s.secondaryButton,
                  {
                    backgroundColor: "#000",
                    borderColor: "#000",
                    flexDirection: "row",
                    gap: 12,
                    marginTop: -8,
                    marginBottom: 20,
                  },
                ]}
                onPress={() => void signInWith("apple")}
                disabled={!!busy}
              >
                <Svg width={17} height={20} viewBox="0 0 384 512">
                  <Path
                    fill="#fff"
                    d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
                  />
                </Svg>
                <Text style={[s.buttonDark, { color: "#fff" }]}>
                  Continue with Apple
                </Text>
              </Pressable>
            )}
            <Text style={[s.tiny, { textAlign: "center", marginTop: 20 }]}>
              Google or Apple creates your own store. Connect your Square account to
              accept payments. Existing sellers can still use their password.
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
            {drafts.length === 0 && <ChevronDown size={16} color={C.muted} />}
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
              <CircleHelp size={20} color={C.errorInk} />
              <Text style={s.errorText}>{error}</Text>
              <Pressable
                accessibilityLabel="Dismiss error"
                onPress={() => setError("")}
                hitSlop={12}
              >
                <X size={18} color={C.errorInk} />
              </Pressable>
            </View>
          )}
          {(snapshot?.store || session.store).paymentProvider ===
            "square_oauth" &&
            (!(snapshot?.store || session.store).locationId ||
              !(snapshot?.store || session.store).business) &&
            tab !== "connections" && (
              <View style={[s.settingCard, { marginBottom: 20 }]}>
                <Text style={s.smallBold}>Finish setting up your store</Text>
                <Text style={s.privacyText}>
                  Connect Square and add pickup details before publishing.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={s.saveName}
                  onPress={() => setTab("connections")}
                >
                  <Text style={s.smallBold}>Set up payments</Text>
                  <ArrowRight size={18} color={C.green} />
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
                <Sparkles size={20} color={C.green} />
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
                    <Art name={d.name} category={d.category} size={68} />
                    <View style={[s.flex, { paddingRight: 36 }]}>
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
                                d.confidence < 0.75 ? C.orange : C.leaf,
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
                    <View style={{ width: 118 }}>
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
                          style={s.stepButton}
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
                          style={s.stepButton}
                        >
                          <Plus size={18} color={C.ink} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                  <Text style={[s.fieldLabel, { marginTop: 15 }]}>
                    CONDITION
                  </Text>
                  <View style={s.conditions} accessibilityRole="radiogroup">
                    {CONDITIONS.map((c) => (
                      <Pressable
                        key={c}
                        accessibilityRole="radio"
                        accessibilityLabel={`${c}, condition of ${d.name}`}
                        accessibilityState={{
                          checked: d.condition === c,
                          disabled: !!busy || publishLocked,
                        }}
                        onPress={() => edit(d.id, { condition: c })}
                        disabled={!!busy || publishLocked}
                        style={[
                          s.conditionChip,
                          d.condition === c && s.conditionChipOn,
                        ]}
                      >
                        <Text
                          style={[
                            s.conditionText,
                            d.condition === c && s.conditionTextOn,
                          ]}
                        >
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: whyOpen.includes(d.id) }}
                    onPress={() =>
                      setWhyOpen((open) =>
                        open.includes(d.id)
                          ? open.filter((id) => id !== d.id)
                          : [...open, d.id],
                      )
                    }
                    style={s.whyToggle}
                  >
                    <Text style={s.smallBold}>Why this price?</Text>
                    {whyOpen.includes(d.id) ? (
                      <ChevronUp size={15} color={C.green} />
                    ) : (
                      <ChevronDown size={15} color={C.green} />
                    )}
                  </Pressable>
                  {whyOpen.includes(d.id) && (
                    <View>
                      {d.priceRationale && (
                        <>
                          <Text style={s.reason}>
                            <Text style={s.reasonLead}>
                              {d.priceRationale.assumedCondition ===
                              "Check condition"
                                ? "Claude couldn’t confirm the condition."
                                : `Claude assumed ${d.priceRationale.assumedCondition.toLowerCase()} condition.`}
                            </Text>{" "}
                            {d.priceRationale.conditionNote}
                          </Text>
                          {d.priceRationale.factors.map((f, n) => (
                            <Text key={n} style={s.reason}>
                              • {f}
                            </Text>
                          ))}
                          {d.priceRationale.market && (
                            <>
                              <Text style={s.reason}>
                                <Text style={s.reasonLead}>Market check.</Text>{" "}
                                {marketSummary(d.priceRationale.market)}
                              </Text>
                              {d.priceRationale.market.listings.map((c, n) => (
                                <Pressable
                                  key={n}
                                  style={s.comparisonRow}
                                  accessibilityRole="link"
                                  onPress={() => void Linking.openURL(c.url)}
                                >
                                  <Text style={[s.comparisonName, s.flex]}>
                                    {c.title}
                                  </Text>
                                  <Text style={s.comparisonPrice}>
                                    {money(c.price)}
                                  </Text>
                                  <ArrowUpRight size={15} color={C.green} />
                                </Pressable>
                              ))}
                            </>
                          )}
                        </>
                      )}
                      <Text style={s.reason}>{d.reasoning}</Text>
                      <Text style={[s.reason, s.reasonItalic]}>
                        {d.priceRationale?.market?.listings.length
                          ? "Claude’s estimate from your photo and active asking prices, not an appraisal or recent sales."
                          : "Claude’s estimate from your photo, not an appraisal or recent sales."}
                      </Text>
                    </View>
                  )}
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
                <ShieldCheck size={16} color={C.muted} />
                <Text style={s.tiny}>Payments secured by Square</Text>
              </View>
            </>
          ) : tab === "home" ? (
            <>
              <View style={s.greetingRow}>
                <Eyebrow text="YOUR NEXT LITTLE BEGINNING" />
                <View style={s.dayBadge}>
                  <Leaf size={14} color={C.green} />
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
                  <ScanLine size={14} color={C.ink} />
                  <Text style={s.photoTagText}>
                    A table full of possibilities
                  </Text>
                </View>
                <View style={s.heroCopy}>
                  <View style={s.heroPill}>
                    <Sparkles size={14} color={C.green} />
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
                    <Pressable
                      onPress={() => setTab("store")}
                      style={s.addLink}
                    >
                      <Text style={s.smallBold}>View all →</Text>
                    </Pressable>
                  </View>
                  {snapshot!.items.slice(-3).map((i) => (
                    <InventoryRow
                      key={i.id}
                      item={i}
                      onPress={() => setEditingItem(i)}
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
                          <step.icon size={22} color={C.green} />
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
                <Leaf size={20} color={C.moss} />
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
                      <ExternalLink size={14} color={C.muted} />
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
                        onPress={() => setEditingItem(i)}
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
              {(snapshot?.store || session.store).paymentProvider ===
                "square_oauth" && (
                <PaymentSetup
                  key={session.store.id}
                  store={snapshot?.store || session.store}
                  token={session.token}
                  onChanged={() => {
                    void refresh();
                  }}
                />
              )}
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
                if (
                  integration.name === "Square" &&
                  (snapshot?.store || session.store).paymentProvider ===
                    "square_oauth"
                )
                  return null;
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
              <Camera size={26} color="white" />
            </Pressable>
            <Nav
              icon={Settings2}
              label="Connections"
              selected={tab === "connections"}
              onPress={() => setTab("connections")}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Storefront: ${session.store.name}. Switch or add a storefront`}
              accessibilityState={{ expanded: storesOpen }}
              onPress={() => {
                setStoresOpen(true);
                void loadStores(session.token);
              }}
              disabled={!!busy}
              style={s.navItem}
            >
              <View style={[s.navIconWrap, storesOpen && s.navIconWrapOn]}>
                <View style={[s.navAvatar, storesOpen && s.navAvatarOn]}>
                  <Text
                    style={[s.navAvatarText, storesOpen && { color: C.paper }]}
                  >
                    {session.store.name.slice(0, 1)}
                  </Text>
                </View>
              </View>
              <Text style={[s.navLabel, storesOpen && s.navLabelOn]}>
                Switch
              </Text>
            </Pressable>
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
        {editingItem && session && (
          <ProductEditor
            key={editingItem.id}
            item={editingItem}
            token={session.token}
            onClose={() => setEditingItem(null)}
            onSaved={(next) => {
              setSnapshot(next);
              setEditingItem(null);
              notify("Product updated.");
              void loadStores(session.token);
            }}
          />
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
      <View style={[s.navIconWrap, selected && s.navIconWrapOn]}>
        <Icon
          size={22}
          color={selected ? C.green : C.muted}
          strokeWidth={selected ? 2.1 : 1.7}
        />
      </View>
      <Text style={[s.navLabel, selected && s.navLabelOn]}>{label}</Text>
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
    <Pressable
      style={s.inventoryRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.name}`}
    >
      <Art name={item.name} category={item.category} photoId={item.photoId} />
      <View style={s.flex}>
        <Text style={s.inventoryName}>{item.name}</Text>
        <View style={s.inventoryStatus}>
          <View
            style={[
              s.dot,
              { backgroundColor: !item.remaining ? C.quiet : C.orange },
            ]}
          />
          <Text style={s.tiny}>
            {item.editing
              ? "Saving changes · tap to finish"
              : !item.remaining
                ? "Found a new home"
                : `${item.available} available${item.remaining > item.available ? " · checkout in progress" : ""}`}
          </Text>
        </View>
      </View>
      <Text style={s.inventoryPrice}>{money(item.price)}</Text>
      <Pencil size={18} color={C.green} />
    </Pressable>
  );
}
const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  safe: { flex: 1, backgroundColor: C.paper },
  topBar: {
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 12,
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
    paddingRight: 12,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
  },
  storePillText: {
    fontFamily: F.semi,
    ...T.subhead,
    color: C.ink,
    flexShrink: 1,
  },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 6,
  },
  storeRowOpen: { backgroundColor: C.sage, borderColor: C.sageLine },
  storeRowName: {
    fontFamily: F.semi,
    ...T.headline,
    color: C.ink,
    marginBottom: 2,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    fontFamily: F.bold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -1,
    color: C.ink,
  },
  brandA: { fontFamily: F.regular, fontSize: 20 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e7ebdc",
    borderWidth: 1,
    borderColor: C.sageLine,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: F.serif, fontSize: 18, lineHeight: 22, color: C.green },
  scroll: { padding: 20, paddingTop: 24, paddingBottom: 40 },
  greetingRow: { gap: 14, marginBottom: 14 },
  eyebrow: {
    fontFamily: F.semi,
    ...T.caption,
    letterSpacing: 1.3,
    color: C.muted,
  },
  dayBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#edf0e4",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: R.pill,
    minHeight: 30,
  },
  badgeText: { fontFamily: F.medium, ...T.footnote, color: C.green },
  title: {
    fontFamily: F.serif,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.2,
    color: C.ink,
    marginTop: 6,
  },
  italic: { fontFamily: F.italic, color: C.moss },
  subtitle: {
    fontFamily: F.regular,
    ...T.callout,
    lineHeight: 24,
    color: C.muted,
    marginTop: 8,
    marginBottom: 26,
  },
  hero: {
    borderRadius: R.lg,
    overflow: "hidden",
    backgroundColor: "#e9edde",
    borderWidth: 1,
    borderColor: "#e2e6d6",
  },
  heroPhoto: { width: "100%", height: 196, resizeMode: "cover" },
  photoTag: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fffdf3e8",
    borderRadius: R.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
    minHeight: 32,
  },
  photoTagText: { fontFamily: F.medium, ...T.caption, color: C.ink },
  heroCopy: { padding: 24 },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroEyebrow: {
    fontFamily: F.semi,
    ...T.caption,
    letterSpacing: 1.2,
    color: C.green,
  },
  heroTitle: {
    fontFamily: F.serif,
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.4,
    color: C.ink,
    marginTop: 16,
  },
  heroBody: {
    fontFamily: F.regular,
    ...T.callout,
    lineHeight: 24,
    color: C.muted,
    marginTop: 12,
    marginBottom: 22,
  },
  button: {
    backgroundColor: C.green,
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  buttonText: { fontFamily: F.semi, ...T.headline, color: "white" },
  buttonDark: { fontFamily: F.semi, ...T.headline, color: C.green },
  secondaryAction: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 2,
    minHeight: 48,
  },
  smallBold: { fontFamily: F.semi, ...T.subhead, color: C.green },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 32,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: F.serif,
    ...T.title2,
    letterSpacing: -0.4,
    color: C.ink,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: R.pill,
    backgroundColor: "#edf0e5",
    minHeight: 30,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.leaf },
  tiny: { fontFamily: F.regular, ...T.footnote, color: C.muted },
  statsRow: { flexDirection: "row", gap: 12 },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    padding: 18,
    backgroundColor: C.white,
  },
  statLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  statNumber: {
    fontFamily: F.serif,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1,
    color: C.ink,
    marginTop: 14,
  },
  statUnit: {
    fontFamily: F.regular,
    ...T.subhead,
    letterSpacing: 0,
    color: C.muted,
  },
  statCaption: {
    fontFamily: F.regular,
    ...T.footnote,
    color: C.muted,
    marginTop: 4,
  },
  how: { marginTop: 30, paddingVertical: 8 },
  howRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 22,
  },
  howStep: { flex: 1, alignItems: "center" },
  howIcon: {
    width: 52,
    height: 52,
    borderRadius: R.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.sage,
    marginBottom: 12,
  },
  howTitle: {
    fontFamily: F.semi,
    ...T.callout,
    color: C.ink,
    textAlign: "center",
  },
  howNote: {
    fontFamily: F.regular,
    ...T.footnote,
    color: C.muted,
    marginTop: 4,
    textAlign: "center",
  },
  earthNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 32,
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  earthText: {
    fontFamily: F.italic,
    fontSize: 18,
    lineHeight: 24,
    color: C.moss,
    flexShrink: 1,
  },
  nav: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.paper,
    gap: 2,
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 52,
  },
  navAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e7ebdc",
    borderWidth: 1,
    borderColor: C.sageLine,
    alignItems: "center",
    justifyContent: "center",
  },
  navAvatarOn: { backgroundColor: C.green, borderColor: C.green },
  navAvatarText: {
    fontFamily: F.serif,
    fontSize: 14,
    lineHeight: 17,
    color: C.green,
  },
  navIconWrap: {
    width: 56,
    height: 32,
    borderRadius: R.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  navIconWrapOn: { backgroundColor: C.sage },
  navLabel: {
    fontFamily: F.medium,
    ...T.caption,
    color: C.muted,
    textAlign: "center",
  },
  navLabelOn: { color: C.green, fontFamily: F.semi },
  scanNav: {
    height: 56,
    width: 62,
    flexShrink: 0,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.green,
    marginTop: -16,
    marginBottom: 4,
    boxShadow: "0 6px 14px #193d3326",
  },
  error: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: C.errorBg,
    borderRadius: R.sm,
    padding: 14,
    marginBottom: 18,
  },
  errorText: {
    flex: 1,
    fontFamily: F.regular,
    ...T.subhead,
    lineHeight: 21,
    color: C.errorInk,
  },
  inlineError: {
    fontFamily: F.regular,
    ...T.subhead,
    color: C.errorInk,
    marginBottom: 18,
  },
  toast: {
    position: "absolute",
    bottom: 104,
    left: 20,
    right: 20,
    backgroundColor: C.ink,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    zIndex: 5,
  },
  toastText: { fontFamily: F.medium, ...T.subhead, color: "white", flex: 1 },
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
    borderRadius: R.lg,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    margin: 24,
  },
  busyTitle: {
    fontFamily: F.serif,
    ...T.title2,
    textAlign: "center",
    color: C.ink,
    marginTop: 20,
    marginBottom: 8,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    minHeight: 44,
    alignSelf: "flex-start",
  },
  reviewNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: R.md,
    backgroundColor: C.sage,
    marginBottom: 20,
  },
  noticeText: {
    flex: 1,
    fontFamily: F.regular,
    ...T.subhead,
    lineHeight: 21,
    color: "#4f5f44",
  },
  scanPreview: {
    width: "100%",
    height: 190,
    borderRadius: R.md,
    marginBottom: 16,
  },
  draftCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    padding: 18,
    marginBottom: 14,
  },
  draftTop: { flexDirection: "row", gap: 14, alignItems: "center" },
  category: {
    fontFamily: F.medium,
    ...T.caption,
    letterSpacing: 0.8,
    color: C.muted,
  },
  itemInput: {
    fontFamily: F.semi,
    fontSize: 18,
    lineHeight: 24,
    color: C.ink,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    minHeight: 44,
  },
  confidence: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  delete: {
    position: "absolute",
    top: -10,
    right: -10,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  priceRow: { flexDirection: "row", gap: 14, marginTop: 20 },
  fieldLabel: {
    fontFamily: F.semi,
    ...T.caption,
    letterSpacing: 1,
    color: C.muted,
    marginBottom: 8,
  },
  priceInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.sm,
    backgroundColor: "white",
    minHeight: 52,
    paddingHorizontal: 14,
  },
  dollar: { fontFamily: F.medium, fontSize: 18, lineHeight: 24, color: C.ink },
  priceInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: F.medium,
    fontSize: 20,
    color: C.ink,
    padding: 8,
    minHeight: 48,
  },
  quantity: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.sm,
    minHeight: 52,
    backgroundColor: "white",
  },
  stepButton: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  step: { fontFamily: F.medium, fontSize: 24, lineHeight: 30, color: C.green },
  qty: { fontFamily: F.medium, ...T.headline, color: C.ink },
  conditions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  conditionChip: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.pill,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: "center",
    backgroundColor: "white",
  },
  conditionChipOn: { backgroundColor: C.green, borderColor: C.green },
  conditionText: { fontFamily: F.medium, ...T.subhead, color: C.ink },
  conditionTextOn: { color: "white" },
  whyToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    minHeight: 44,
    alignSelf: "flex-start",
  },
  reason: {
    fontFamily: F.regular,
    ...T.subhead,
    lineHeight: 22,
    color: C.muted,
    marginTop: 6,
  },
  reasonLead: { fontFamily: F.semi, color: C.ink },
  reasonItalic: { fontFamily: F.italic, fontSize: 16, color: C.moss },
  reviewTotal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 18,
    marginBottom: 10,
  },
  body: { fontFamily: F.regular, ...T.subhead, color: C.muted, flexShrink: 1 },
  totalValue: {
    fontFamily: F.serif,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: C.ink,
  },
  centerNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  inventoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    minHeight: 72,
  },
  inventoryName: {
    fontFamily: F.semi,
    ...T.callout,
    lineHeight: 22,
    color: C.ink,
  },
  inventoryStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  inventoryPrice: { fontFamily: F.medium, ...T.headline, color: C.ink },
  storeCard: {
    alignItems: "center",
    backgroundColor: C.sage,
    borderRadius: R.lg,
    padding: 26,
    borderWidth: 1,
    borderColor: "#e0e6d4",
  },
  storeAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#cedbbd",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  storeAvatarText: {
    fontFamily: F.serif,
    fontSize: 30,
    lineHeight: 36,
    color: C.green,
  },
  storeName: {
    fontFamily: F.serif,
    fontSize: 30,
    lineHeight: 36,
    color: C.ink,
    textAlign: "center",
    letterSpacing: -0.6,
  },
  storeTagline: {
    fontFamily: F.regular,
    ...T.subhead,
    color: C.muted,
    marginTop: 6,
    textAlign: "center",
  },
  storeActions: { flexDirection: "row", gap: 10, marginTop: 22 },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#cdd8bd",
    backgroundColor: "#f6f8ef",
    borderRadius: R.sm,
    minHeight: 48,
  },
  storeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    minHeight: 44,
  },
  addLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  searchInput: {
    fontFamily: F.regular,
    ...T.callout,
    color: C.ink,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.sm,
    marginBottom: 8,
    minHeight: 50,
  },
  activity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  activityText: {
    fontFamily: F.medium,
    ...T.callout,
    lineHeight: 22,
    color: C.ink,
    marginBottom: 3,
  },
  empty: { alignItems: "center", paddingVertical: 40, gap: 16 },
  emptyIcon: {
    width: 92,
    height: 92,
    borderRadius: R.xl,
    backgroundColor: C.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: F.serif,
    fontSize: 26,
    lineHeight: 32,
    color: C.ink,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  emptyBody: {
    fontFamily: F.regular,
    ...T.callout,
    lineHeight: 24,
    color: C.muted,
    textAlign: "center",
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    padding: 20,
  },
  storeNameInput: {
    fontFamily: F.serif,
    fontSize: 24,
    lineHeight: 30,
    color: C.ink,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 10,
    minHeight: 50,
  },
  fieldInput: { fontFamily: F.regular, fontSize: 17, lineHeight: 22, minWidth: 0 },
  dangerCard: { marginTop: 14, borderColor: "#edc8b8" },
  dangerBody: {
    fontFamily: F.regular,
    ...T.subhead,
    lineHeight: 22,
    color: C.muted,
  },
  saveName: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-end",
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  integration: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  integrationIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  integrationTitle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  integrationName: { fontFamily: F.semi, ...T.headline, color: C.ink },
  integrationStatus: {
    fontFamily: F.semi,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
  },
  integrationFeature: {
    fontFamily: F.medium,
    ...T.subhead,
    color: "#4f5f44",
    marginTop: 6,
  },
  integrationDetail: {
    fontFamily: F.regular,
    ...T.footnote,
    lineHeight: 19,
    color: C.muted,
    marginTop: 4,
  },
  privacyCard: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: C.sage,
    padding: 18,
    borderRadius: R.md,
    marginTop: 26,
  },
  privacyText: {
    fontFamily: F.regular,
    ...T.subhead,
    lineHeight: 21,
    color: C.muted,
    marginTop: 6,
  },
  serverNote: {
    fontFamily: F.regular,
    ...T.footnote,
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
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    padding: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  sheetHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d3dac7",
    alignSelf: "center",
    marginBottom: 24,
  },
  sheetTitle: {
    fontFamily: F.serif,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.9,
    color: C.ink,
    marginTop: 12,
  },
  sheetBody: {
    fontFamily: F.regular,
    ...T.callout,
    lineHeight: 24,
    color: C.muted,
    marginTop: 12,
    marginBottom: 24,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#cbd5be",
    borderRadius: 14,
    minHeight: 56,
    padding: 16,
    marginTop: 12,
  },
  qrBackdrop: {
    flex: 1,
    backgroundColor: "#17372c80",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  qrCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: R.lg,
    padding: 28,
    paddingTop: 32,
    backgroundColor: C.paper,
    alignItems: "center",
  },
  qrClose: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  qrLeaf: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.sage,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  qrTitle: {
    fontFamily: F.serif,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: C.ink,
    marginTop: 12,
    textAlign: "center",
  },
  qrBody: {
    fontFamily: F.regular,
    ...T.callout,
    color: C.muted,
    marginTop: 8,
    textAlign: "center",
  },
  qrCode: {
    padding: 20,
    backgroundColor: "white",
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    marginTop: 22,
  },
  qrFootnote: {
    fontFamily: F.medium,
    ...T.footnote,
    color: C.muted,
    marginTop: 14,
    marginBottom: 20,
  },
  qrNetwork: {
    fontFamily: F.regular,
    ...T.footnote,
    color: C.muted,
    textAlign: "center",
    maxWidth: 280,
  },
  comparisonRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    minHeight: 64,
  },
  comparisonName: {
    fontFamily: F.medium,
    ...T.callout,
    lineHeight: 22,
    color: C.ink,
    marginBottom: 4,
  },
  comparisonPrice: { fontFamily: F.semi, ...T.headline, color: C.ink },
});
