import { google } from "googleapis";
import { env } from "../config/env.js";
import { retry } from "../utils/retry.js";
import { bufferToStream } from "../utils/stream.js";
import { escapeDriveQuery, normalizeName } from "../utils/strings.js";

const oauth2Client = new google.auth.OAuth2(
  env.googleClientId,
  env.googleClientSecret,
);

oauth2Client.setCredentials({
  refresh_token: env.googleRefreshToken,
});

const drive = google.drive({
  version: "v3",
  auth: oauth2Client,
});

const folderCache = new Map();
const folderLocks = new Map();

export async function findOrCreateFolder(name, parent) {
  name = normalizeName(name);
  const key = `${parent}:${name}`;
  logDriveDebug("findOrCreateFolder:start", { name, parent });

  if (folderCache.has(key)) {
    logDriveDebug("findOrCreateFolder:cache-hit", {
      name,
      parent,
      folderId: folderCache.get(key),
    });
    return folderCache.get(key);
  }

  if (folderLocks.has(key)) {
    logDriveDebug("findOrCreateFolder:lock-wait", { name, parent });
    return folderLocks.get(key);
  }

  const promise = (async () => {
    try {
      const safeName = escapeDriveQuery(name);
      logDriveDebug("findOrCreateFolder:list", { name, parent });

      const res = await retry(() =>
        drive.files.list({
          q: `'${parent}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: "files(id,name)",
        }),
      );

      let folderId;

      if (res.data.files.length > 0) {
        folderId = res.data.files[0].id;
        logDriveDebug("findOrCreateFolder:found", {
          name,
          parent,
          folderId,
        });
      } else {
        logDriveDebug("findOrCreateFolder:create", { name, parent });
        const folder = await retry(() =>
          drive.files.create({
            requestBody: {
              name,
              mimeType: "application/vnd.google-apps.folder",
              parents: [parent],
            },
            fields: "id",
          }),
        );

        folderId = folder.data.id;
        logDriveDebug("findOrCreateFolder:created", {
          name,
          parent,
          folderId,
        });
      }

      folderCache.set(key, folderId);
      return folderId;
    } catch (error) {
      logDriveDebug("findOrCreateFolder:error", {
        name,
        parent,
        error: serializeDriveError(error),
      });
      throw error;
    } finally {
      folderLocks.delete(key);
    }
  })();

  folderLocks.set(key, promise);
  return promise;
}

export async function uploadOrReplaceFile(fileName, parentFolder, pdfBuffer) {
  const safeName = escapeDriveQuery(fileName);
  logDriveDebug("uploadOrReplaceFile:start", {
    fileName,
    parentFolder,
    sizeBytes: pdfBuffer.length,
  });

  const existing = await retry(() =>
    drive.files.list({
      q: `'${parentFolder}' in parents and name='${safeName}' and trashed=false`,
      fields: "files(id,name)",
    }),
  );
  logDriveDebug("uploadOrReplaceFile:list-result", {
    fileName,
    parentFolder,
    matches: existing.data.files.length,
  });

  if (existing.data.files.length > 0) {
    const mainFile = existing.data.files[0].id;
    const pdfStream = bufferToStream(pdfBuffer);
    logDriveDebug("uploadOrReplaceFile:update", {
      fileName,
      parentFolder,
      fileId: mainFile,
    });

    const updated = await retry(() =>
      drive.files.update({
        fileId: mainFile,
        fields: "id,name,webViewLink,webContentLink,parents",
        media: {
          mimeType: "application/pdf",
          body: pdfStream,
        },
      }),
    );
    logDriveDebug("uploadOrReplaceFile:updated", {
      fileName,
      parentFolder,
      fileId: mainFile,
    });

    if (existing.data.files.length > 1) {
      for (let i = 1; i < existing.data.files.length; i++) {
        logDriveDebug("uploadOrReplaceFile:trash-duplicate", {
          fileName,
          duplicateFileId: existing.data.files[i].id,
        });
        await retry(() =>
          drive.files.update({
            fileId: existing.data.files[i].id,
            requestBody: { trashed: true },
          }),
        );
      }
    }
    return {
      fileId: updated.data.id || mainFile,
      fileName: updated.data.name || fileName,
      webViewLink: updated.data.webViewLink || null,
      webContentLink: updated.data.webContentLink || null,
      parentFolder,
    };
  } else {
    const pdfStream = bufferToStream(pdfBuffer);
    logDriveDebug("uploadOrReplaceFile:create", {
      fileName,
      parentFolder,
    });

    const created = await retry(() =>
      drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentFolder],
        },
        fields: "id,name,webViewLink,webContentLink,parents",
        media: {
          mimeType: "application/pdf",
          body: pdfStream,
        },
      }),
    );
    logDriveDebug("uploadOrReplaceFile:created", {
      fileName,
      parentFolder,
    });
    return {
      fileId: created.data.id || null,
      fileName: created.data.name || fileName,
      webViewLink: created.data.webViewLink || null,
      webContentLink: created.data.webContentLink || null,
      parentFolder,
    };
  }
}

function logDriveDebug(event, details) {
  if (!env.driveDebug) {
    return;
  }

  console.log(`[drive-debug] ${event}`, details);
}

function serializeDriveError(error) {
  return {
    message:
      error?.response?.data?.error?.message || error?.message || String(error),
    code: error?.code || null,
    status: error?.status || error?.response?.status || null,
    errors: error?.response?.data?.error?.errors || null,
  };
}
