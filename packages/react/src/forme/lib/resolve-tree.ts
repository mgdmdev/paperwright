import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import * as Forme from "@formepdf/react";

/**
 * Expands every function component in a tree down to Forme primitives, with a hook dispatcher
 * that supports context, so `useContext`-based providers work before Forme's `serialize()`
 * sees the tree. Forme's serializer calls components bare and cannot see context; running this
 * first gives it a tree of primitives only, which it handles by identity.
 */

const FORME_PRIMITIVES = new Set<unknown>([
  Forme.Document, Forme.Page, Forme.View, Forme.Text, Forme.H1, Forme.H2, Forme.H3, Forme.H4, Forme.H5, Forme.H6,
  Forme.OrderedList, Forme.UnorderedList, Forme.ListItem, Forme.Strong, Forme.Em, Forme.Code, Forme.Link, Forme.Image,
  Forme.Table, Forme.Row, Forme.Cell, Forme.Fixed, Forme.Svg, Forme.QrCode, Forme.Barcode, Forme.Canvas, Forme.Watermark,
  Forme.PageBreak, Forme.BarChart, Forme.LineChart, Forme.PieChart, Forme.AreaChart, Forme.DotPlot, Forme.TextField,
  Forme.Checkbox, Forme.Dropdown, Forme.RadioButton, Forme.LegacyBarChart, Forme.LegacyLineChart, Forme.LegacyPieChart,
]);

const REACT_CONTEXT = Symbol.for("react.context");
const REACT_PROVIDER = Symbol.for("react.provider");
const REACT_CONSUMER = Symbol.for("react.consumer");
const REACT_FRAGMENT = Symbol.for("react.fragment");
const REACT_MEMO = Symbol.for("react.memo");
const REACT_FORWARD_REF = Symbol.for("react.forward_ref");

type ContextLike = { _currentValue?: unknown; $$typeof?: symbol; _context?: ContextLike };
type Contexts = Map<unknown, unknown>;

interface DispatcherSlot {
  get(): unknown;
  set(value: unknown): void;
}

const findDispatcherSlot = (): DispatcherSlot | null => {
  const internals = (React as unknown as Record<string, unknown>)[
    "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE"
  ] as { H?: unknown } | undefined;
  if (internals && typeof internals === "object" && "H" in internals) {
    return { get: () => internals.H, set: (v) => { internals.H = v; } };
  }
  return null;
};

const noop = () => {};

const makeDispatcher = (contexts: Contexts) => {
  let ids = 0;
  const read = (ctx: unknown) =>
    contexts.has(ctx) ? contexts.get(ctx) : (ctx as ContextLike)?._currentValue;
  return {
    readContext: read,
    useContext: read,
    use: (value: unknown) => {
      if (value && typeof value === "object" && "then" in value) {
        throw new Error("resolveTree cannot suspend on a promise");
      }
      return read(value);
    },
    useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, noop],
    useReducer: (_r: unknown, initialArg: unknown, init?: (a: unknown) => unknown) => [init ? init(initialArg) : initialArg, noop],
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (fn: unknown) => fn,
    useRef: (initial: unknown) => ({ current: initial }),
    useEffect: noop,
    useLayoutEffect: noop,
    useInsertionEffect: noop,
    useImperativeHandle: noop,
    useDebugValue: noop,
    useDeferredValue: (value: unknown) => value,
    useTransition: () => [false, noop],
    useOptimistic: (value: unknown) => [value, noop],
    useActionState: (_a: unknown, initial: unknown) => [initial, noop, false],
    useSyncExternalStore: (_s: unknown, getSnapshot: () => unknown, getServer?: () => unknown) => (getServer ?? getSnapshot)(),
    useId: () => `:r${ids++}:`,
    useCacheRefresh: () => noop,
    useHostTransitionStatus: () => ({ pending: false, data: null, method: null, action: null }),
  };
};

const callWithDispatcher = (fn: (props: unknown) => ReactNode, props: unknown, contexts: Contexts): ReactNode => {
  const slot = findDispatcherSlot();
  if (!slot) return fn(props);
  const previous = slot.get();
  slot.set(makeDispatcher(contexts));
  try {
    return fn(props);
  } finally {
    slot.set(previous);
  }
};

const childrenOf = (element: ReactElement): ReactNode =>
  (element.props as { children?: ReactNode }).children;

const resolveNode = (node: ReactNode, contexts: Contexts): ReactNode => {
  if (node === null || node === undefined || typeof node === "boolean") return node;
  if (typeof node === "string" || typeof node === "number") return node;
  if (Array.isArray(node)) return node.flatMap((child) => flattenFragment(resolveNode(child, contexts)));
  if (typeof node === "object" && Symbol.iterator in node) {
    return Array.from(node as Iterable<ReactNode>).flatMap((child) => flattenFragment(resolveNode(child, contexts)));
  }
  if (!React.isValidElement(node)) return node;
  return resolveElement(node, contexts);
};

const flattenFragment = (node: ReactNode): ReactNode[] => (Array.isArray(node) ? node : [node]);

const resolveElement = (element: ReactElement, contexts: Contexts): ReactNode => {
  const type = element.type as unknown;

  if (type === REACT_FRAGMENT) return resolveNode(childrenOf(element), contexts);

  if (typeof type === "object" && type !== null) {
    const tag = (type as ContextLike).$$typeof;
    if (tag === REACT_PROVIDER) return resolveProvider(element, (type as ContextLike)._context, contexts);
    if (tag === REACT_CONSUMER) return resolveConsumer(element, (type as ContextLike)._context ?? type, contexts);
    if (tag === REACT_CONTEXT) {
      return typeof childrenOf(element) === "function"
        ? resolveConsumer(element, type, contexts)
        : resolveProvider(element, type, contexts);
    }
    if (tag === REACT_MEMO) {
      const inner = (type as { type: unknown }).type;
      return resolveElement(React.createElement(inner as React.ComponentType, element.props as object), contexts);
    }
    if (tag === REACT_FORWARD_REF) {
      const render = (type as { render: (props: unknown, ref: null) => ReactNode }).render;
      return resolveNode(callWithDispatcher((p) => render(p, null), element.props, contexts), contexts);
    }
    return element;
  }

  if (typeof type === "function" && !FORME_PRIMITIVES.has(type)) {
    const rendered = callWithDispatcher(type as (props: unknown) => ReactNode, element.props, contexts);
    return resolveNode(rendered, contexts);
  }

  // A primitive (or a host string, which Forme rejects with its own message): keep it, resolve its children.
  const props = element.props as Record<string, unknown>;
  if (!("children" in props)) return element;
  const resolvedChildren = resolveNode(props.children as ReactNode, contexts);
  return React.cloneElement(element, undefined, ...(Array.isArray(resolvedChildren) ? resolvedChildren : [resolvedChildren]));
};

const resolveProvider = (element: ReactElement, context: unknown, contexts: Contexts): ReactNode => {
  const next: Contexts = new Map(contexts);
  next.set(context, (element.props as { value?: unknown }).value);
  return resolveNode(childrenOf(element), next);
};

const resolveConsumer = (element: ReactElement, context: unknown, contexts: Contexts): ReactNode => {
  const render = childrenOf(element) as unknown;
  const value = contexts.has(context) ? contexts.get(context) : (context as ContextLike)?._currentValue;
  if (typeof render === "function") return resolveNode((render as (v: unknown) => ReactNode)(value), contexts);
  return resolveNode(render as ReactNode, contexts);
};

/** Returns the same document with every component expanded to Forme primitives. */
export const resolveTree = (element: ReactElement): ReactElement => {
  const resolved = resolveNode(element, new Map());
  if (React.isValidElement(resolved)) return resolved;
  throw new Error("resolveTree: the root must resolve to a single element");
};
