import { useEffect, useState } from "react";

const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const idLen = 6;

/** Track whether the very first getHash() call generated a new session. */
let firstCallGenerated = false;
let firstCallDone = false;

function getHash() {
  const isNew = !window.location.hash;
  if (isNew) {
    let id = "";
    for (let i = 0; i < idLen; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    window.history.replaceState(null, "", "#" + id);
  }
  if (!firstCallDone) {
    firstCallGenerated = isNew;
    firstCallDone = true;
  }
  return window.location.hash.slice(1);
}

function useHash(): { id: string; isNewSession: boolean } {
  const [hash, setHash] = useState(getHash);

  useEffect(() => {
    const handler = () => setHash(getHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  return { id: hash, isNewSession: firstCallGenerated };
}

export default useHash;
