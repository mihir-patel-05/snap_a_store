"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { newRequestKey } from "@/lib/request-key";
import {
  Condition,
  DraftItem,
  EditItemRequest,
  type Item,
  type StoreSnapshot,
} from "@/lib/contracts";

export function ProductEditor({
  item,
  onClose,
  onSaved,
}: {
  item: Item;
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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save() {
    setError("");
    setBusy(true);
    try {
      const input =
        request.current ||
        EditItemRequest.parse({
          name,
          description,
          category,
          condition,
          price: price.trim() ? Number(price) : NaN,
          remaining: stock.trim() ? Number(stock) : NaN,
          expectedVersion: item.editVersion || 0,
          requestKey: await newRequestKey(),
        });
      request.current = input;
      setLocked(true);
      const result = await api<StoreSnapshot>(
        `/stores/${item.storeId}/items/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      onSaved(result);
    } catch (e) {
      if (e && typeof e === "object" && "issues" in e) {
        setError(
          "Use a name of 2–100 characters, a price from $0.50–$10,000 with at most two decimals, and whole-number stock from 0–100.",
        );
      } else {
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
  return (
    <dialog
      ref={dialog}
      className="product-editor"
      aria-labelledby="edit-product-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="section-heading small">
          <h2 id="edit-product-title">Edit product</h2>
          <button
            className="text-link"
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close product editor"
          >
            Close
          </button>
        </div>
        <p>
          Changes update your storefront and Square catalog. Open checkouts keep
          their original price.
        </p>
        <fieldset disabled={busy || locked}>
          <label>
            Product name
            <input
              autoFocus
              value={name}
              maxLength={100}
              minLength={2}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              maxLength={400}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="product-edit-grid">
            <label>
              Price ($)
              <input
                type="number"
                min="0.5"
                max="10000"
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              Unsold stock
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                required
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </label>
            <label>
              Condition
              <select
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as typeof condition)
                }
              >
                {Condition.options.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                {DraftItem.shape.category.unwrap().options.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <p className="product-edit-note">
          Unsold stock includes units reserved by buyers. Set 0 to mark the
          product sold out.
        </p>
        {error && (
          <p className="product-edit-error" role="alert">
            {error}
          </p>
        )}
        {locked && !busy && (
          <p className="product-edit-note">
            Retry saves these same changes. If you close this window, reopen
            Edit to finish the pending save.
          </p>
        )}
        <div className="product-edit-actions">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : locked ? "Retry save" : "Save changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
