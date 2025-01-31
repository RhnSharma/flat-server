import { Controller, FastifySchema } from "../../../../../types/Server";
import { Status } from "../../../../../constants/Project";
import { ErrorCode } from "../../../../../ErrorCode";
import { RoomDAO, RoomRecordDAO } from "../../../../../dao";
import { roomIsRunning } from "../../utils/Room";
import {
    AgoraCloudRecordParamsType,
    AgoraCloudRecordStoppedResponse,
} from "../../../../utils/request/agora/Types";
import { agoraCloudRecordStoppedRequest } from "../../../../utils/request/agora/Agora";
import { getConnection } from "typeorm";
import { getCloudRecordData } from "../../utils/Agora";
import { parseError } from "../../../../../Logger";

export const recordAgoraStopped: Controller<
    RecordAgoraStoppedRequest,
    AgoraCloudRecordStoppedResponse
> = async ({ req, logger }) => {
    const { roomUUID, agoraParams } = req.body;
    const { userUUID } = req.user;

    try {
        const roomInfo = await RoomDAO().findOne(["room_status"], {
            room_uuid: roomUUID,
            owner_uuid: userUUID,
        });

        if (roomInfo === undefined) {
            return {
                status: Status.Failed,
                code: ErrorCode.RoomNotFound,
            };
        }

        if (!roomIsRunning(roomInfo.room_status)) {
            return {
                status: Status.Failed,
                code: ErrorCode.RoomNotIsRunning,
            };
        }

        let agoraResponse: AgoraCloudRecordStoppedResponse;
        await getConnection().transaction(async t => {
            await RoomRecordDAO(t).update(
                {
                    end_time: new Date(),
                },
                {
                    agora_sid: agoraParams.sid,
                },
            );

            const { uid, cname } = await getCloudRecordData(roomUUID, false);

            agoraResponse = await agoraCloudRecordStoppedRequest(agoraParams, {
                uid,
                cname,
                clientRequest: {},
            });
        });

        return {
            status: Status.Success,
            // @ts-ignore
            data: agoraResponse,
        };
    } catch (err) {
        logger.error("request failed", parseError(err));
        return {
            status: Status.Failed,
            code: ErrorCode.CurrentProcessFailed,
        };
    }
};

interface RecordAgoraStoppedRequest {
    body: {
        roomUUID: string;
        agoraParams: AgoraCloudRecordParamsType;
    };
}

export const recordAgoraStoppedSchemaType: FastifySchema<RecordAgoraStoppedRequest> = {
    body: {
        type: "object",
        required: ["roomUUID", "agoraParams"],
        properties: {
            roomUUID: {
                type: "string",
                format: "uuid-v4",
            },
            agoraParams: {
                type: "object",
                required: ["resourceid", "mode", "sid"],
                resourceid: {
                    type: "string",
                },
                mode: {
                    type: "string",
                },
                sid: {
                    type: "string",
                },
            },
        },
    },
};
