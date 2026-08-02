import { z } from "zod";
import { type Fastify } from "../types";
import * as semver from 'semver';
import {
    ANDROID_LATEST_VERSION_CODE,
    ANDROID_LATEST_APK_URL,
    IOS_UP_TO_DATE,
} from "@/versions";

export function versionRoutes(app: Fastify) {
    app.post('/v1/version', {
        schema: {
            body: z.object({
                platform: z.string(),
                version: z.string(),
                app_id: z.string(),
                version_code: z.union([z.number(), z.string()]).optional(),
            }),
            response: {
                200: z.object({
                    updateUrl: z.string().nullable(),
                    // Legacy snake_case fields, read by installed clients
                    // built before the camelCase response was supported.
                    update_required: z.boolean().optional(),
                    update_url: z.string().nullable().optional(),
                })
            }
        }
    }, async (request, reply) => {
        const { platform, version, version_code } = request.body;

        // Check ios
        if (platform.toLowerCase() === 'ios') {
            if (semver.satisfies(version, IOS_UP_TO_DATE)) {
                reply.send({ updateUrl: null });
            } else {
                reply.send({ updateUrl: 'https://apps.apple.com/us/app/happy-claude-code-client/id6748571505' });
            }
            return;
        }

        // Check android
        if (platform.toLowerCase() === 'android') {
            const numericVersionCode = Number(version_code);

            // Clients that report their build number get a precise check.
            if (Number.isSafeInteger(numericVersionCode)) {
                if (numericVersionCode < ANDROID_LATEST_VERSION_CODE) {
                    reply.send({
                        updateUrl: ANDROID_LATEST_APK_URL,
                        update_required: true,
                        update_url: ANDROID_LATEST_APK_URL,
                    });
                } else {
                    reply.send({ updateUrl: null });
                }
                return;
            }

            // Legacy clients (built before version_code reporting) cannot be
            // distinguished by semver — every build that omits version_code
            // predates the current latest build, so flag them as outdated.
            reply.send({
                updateUrl: ANDROID_LATEST_APK_URL,
                update_required: true,
                update_url: ANDROID_LATEST_APK_URL,
            });
            return;
        }

        // Fallbacke
        reply.send({ updateUrl: null });
    });
}
