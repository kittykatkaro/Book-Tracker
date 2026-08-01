import { Router, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { getAuth } from "@clerk/express";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage.js";
import { ObjectPermission } from "../lib/objectAcl.js";

const router = Router();
const objectStorageService = new ObjectStorageService();

// ---------------------------------------------------------------------------
// Auth Middleware
//
// This route serves user-uploaded book cover images referenced by
// book.coverUrl (paths like "/objects/<id>"). It's mounted directly on the
// app (not under /api) because coverUrl values are stored as root-relative
// paths, matching the convention baked into ObjectStorageService.
// ---------------------------------------------------------------------------

interface AuthedRequest extends Request {
  userId?: string;
}

// Soft auth: attach the user id if present, but don't 401 outright — the
// object's own ACL policy (public/private) decides access, checked below.
function attachAuth(req: Request, _res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  (req as AuthedRequest).userId = auth?.userId;
  next();
}

router.get("/objects/*objectPath", attachAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  // Express 5 / path-to-regexp v8: a named wildcard (*objectPath) captures
  // the remainder as an array of segments, not a single string — join it
  // back into a path.
  const segments = req.params.objectPath;
  const objectPath = Array.isArray(segments) ? segments.join("/") : segments;
  const fullPath = `/objects/${objectPath}`;

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(fullPath);

    const canAccess = await objectStorageService.canAccessObjectEntity({
      userId,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const response = await objectStorageService.downloadObject(objectFile);

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (!response.body) {
      return res.status(204).end();
    }

    const nodeStream = Readable.fromWeb(response.body as any);
    nodeStream.on("error", (err) => {
      console.error(`[objects] stream error for ${fullPath}:`, err);
      if (!res.headersSent) res.status(500).end();
    });
    nodeStream.pipe(res);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "Not found" });
    }
    console.error(`[objects] Failed to serve ${fullPath}:`, err);
    return res.status(500).json({ error: "Failed to load object" });
  }
});

export default router;