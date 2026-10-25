import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import type { EditItemRequest, Item, StoreSnapshot } from "../../lib/contracts";
const conditions: Item["condition"][] = [
  "Like new",
  "Good",
  "Fair",
  "Check condition",
];
const categories: Item["category"][] = [
  "Home",
  "Books",
  "Electronics",
  "Fashion",
  "Other",
];
import { api } from "../lib/api";

export function ProductEditor({
  item,
  token,
  onClose,
  onSaved,
}: {
  item: Item;
  token: string;
  onClose: () => void;
  onSaved: (snapshot: StoreSnapshot) => void;
}) {
  const initial = item.pendingEdit || item;
  const [name, setName] = useState(initial.name),
    [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(String(initial.price)),
    [stock, setStock] = useState(String(initial.remaining));
  const [condition, setCondition] = useState(initial.condition),
    [category, setCategory] = useState(initial.category);
  const [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(Boolean(item.pendingEdit)),
    [error, setError] = useState("");
  const request = useRef<EditItemRequest | null>(item.pendingEdit || null);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const input: EditItemRequest = request.current || {
        name,
        description,
        category,
        condition,
        price: price.trim() ? Number(price) : NaN,
        remaining: stock.trim() ? Number(stock) : NaN,
        expectedVersion: item.editVersion || 0,
        requestKey: Crypto.randomUUID(),
      };
      if (
        input.name.trim().length < 2 ||
        input.name.trim().length > 100 ||
        !Number.isFinite(input.price) ||
        input.price < 0.5 ||
        input.price > 10000 ||
        Math.abs(input.price * 100 - Math.round(input.price * 100)) > 0.00001 ||
        !Number.isInteger(input.remaining) ||
        input.remaining < 0 ||
        input.remaining > 100
      )
        throw new Error(
          "Use a name of 2–100 characters, a price from $0.50–$10,000 with at most two decimals, and whole-number stock from 0–100.",
        );
      request.current = input;
      setLocked(true);
      onSaved(
        await api<StoreSnapshot>(
          `/stores/${item.storeId}/items/${encodeURIComponent(item.id)}`,
          token,
          input,
          "PATCH",
        ),
      );
    } catch (e) {
      if (e && typeof e === "object" && "issues" in e)
        setError(
          "Use a name of 2–100 characters, a price from $0.50–$10,000 with at most two decimals, and whole-number stock from 0–100.",
        );
      else {
        setError(
          e instanceof Error ? e.message : "Could not save the product.",
        );
        if (
          [400, 401, 403, 404, 409, 503].includes(
            (e as { status?: number }).status || 0,
          ) &&
          !item.pendingEdit
        ) {
          request.current = null;
          setLocked(false);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const editable = !busy && !locked;
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={s.safe}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.row}>
              <Text style={s.title}>Edit product</Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onClose}
              >
                <Text style={s.link}>Close</Text>
              </Pressable>
            </View>
            <Text style={s.note}>
              Changes update your storefront and Square catalog. Open checkouts
              keep their original price.
            </Text>
            <Text style={s.label}>Product name</Text>
            <TextInput
              style={s.input}
              accessibilityLabel="Product name"
              value={name}
              maxLength={100}
              editable={editable}
              onChangeText={setName}
            />
            <Text style={s.label}>Description</Text>
            <TextInput
              style={[s.input, s.description]}
              accessibilityLabel="Description"
              value={description}
              maxLength={400}
              multiline
              editable={editable}
              onChangeText={setDescription}
            />
            <View style={s.row}>
              <View style={s.field}>
                <Text style={s.label}>Price ($)</Text>
                <TextInput
                  style={s.input}
                  accessibilityLabel="Price"
                  value={price}
                  keyboardType="decimal-pad"
                  editable={editable}
                  onChangeText={setPrice}
                />
              </View>
              <View style={s.field}>
                <Text style={s.label}>Unsold stock</Text>
                <TextInput
                  style={s.input}
                  accessibilityLabel="Unsold stock"
                  value={stock}
                  keyboardType="number-pad"
                  editable={editable}
                  onChangeText={setStock}
                />
              </View>
            </View>
            <Text style={s.note}>
              Stock includes units reserved by buyers. Set 0 to mark the product
              sold out.
            </Text>
            <Text style={s.label}>Condition</Text>
            <View style={s.choices}>
              {conditions.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityState={{ selected: c === condition }}
                  disabled={!editable}
                  onPress={() => setCondition(c)}
                  style={[s.choice, c === condition && s.selected]}
                >
                  <Text style={s.link}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.label}>Category</Text>
            <View style={s.choices}>
              {categories.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityState={{ selected: c === category }}
                  disabled={!editable}
                  onPress={() => setCategory(c)}
                  style={[s.choice, c === category && s.selected]}
                >
                  <Text style={s.link}>{c}</Text>
                </Pressable>
              ))}
            </View>
            {error ? (
              <Text style={s.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {locked && !busy && (
              <Text style={s.note}>
                Retry saves these same changes. Reopen Edit to finish a pending
                save after closing this window.
              </Text>
            )}
            <Pressable
              style={[s.save, busy && { opacity: 0.6 }]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void save()}
            >
              <Text style={s.saveText}>
                {busy ? "Saving…" : locked ? "Retry save" : "Save changes"}
              </Text>
            </Pressable>
            <Pressable
              style={s.cancel}
              accessibilityRole="button"
              disabled={busy}
              onPress={onClose}
            >
              <Text style={s.link}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8f7f1" },
  content: { padding: 24, gap: 12 },
  title: { color: "#193d33", fontSize: 28, fontWeight: "700", flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  field: { flex: 1, gap: 8 },
  label: { color: "#193d33", fontSize: 15, fontWeight: "600", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d5dccd",
    borderRadius: 12,
    backgroundColor: "white",
    color: "#193d33",
    padding: 14,
    fontSize: 16,
  },
  description: { minHeight: 96, textAlignVertical: "top" },
  note: { fontSize: 13, color: "#65715f", lineHeight: 20 },
  choices: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  choice: {
    padding: 11,
    borderWidth: 1,
    borderColor: "#d5dccd",
    borderRadius: 10,
  },
  selected: { backgroundColor: "#d9ef9b", borderColor: "#193d33" },
  link: { color: "#193d33", fontWeight: "600" },
  error: {
    color: "#9e3a24",
    backgroundColor: "#fbe8dd",
    padding: 14,
    borderRadius: 10,
  },
  save: {
    backgroundColor: "#193d33",
    padding: 17,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
  },
  saveText: { color: "white", fontWeight: "700", fontSize: 16 },
  cancel: { padding: 12, alignItems: "center" },
});
