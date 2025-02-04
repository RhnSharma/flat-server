import { Controller, FastifySchema } from "../../../../types/Server";
import { createQueryBuilder, In } from "typeorm";
import { RoomUserModel } from "../../../../model/room/RoomUser";
import { RoomModel } from "../../../../model/room/Room";
import { UserModel } from "../../../../model/user/User";
import { ListType, RoomStatus, RoomType } from "../../../../model/room/Constants";
import { Status } from "../../../../constants/Project";
import { ErrorCode } from "../../../../ErrorCode";
import { RoomRecordDAO } from "../../../../dao";

import { parseError } from "../../../../Logger";

export const list: Controller<ListRequest, ListResponse> = async ({ req, logger }) => {
    const { type } = req.params;

    try {
        let queryBuilder = createQueryBuilder(RoomUserModel, "ru")
            .addSelect("r.title", "title")
            .addSelect("r.room_uuid", "room_uuid")
            .addSelect("r.periodic_uuid", "periodic_uuid")
            .addSelect("r.room_type", "room_type")
            .addSelect("r.begin_time", "begin_time")
            .addSelect("r.end_time", "end_time")
            .addSelect("r.owner_uuid", "owner_uuid")
            .addSelect("r.room_status", "room_status")
            .addSelect("u.user_name", "owner_user_name")
            .innerJoin(RoomModel, "r", "ru.room_uuid = r.room_uuid")
            .innerJoin(UserModel, "u", "u.user_uuid = r.owner_uuid");

        switch (type) {
            case ListType.All: {
                queryBuilder = queryBuilder.where(
                    `ru.user_uuid = :userUUID
                    AND r.room_status <> :notRoomStatus
                    AND ru.is_delete = false
                    AND r.is_delete = false`,
                    {
                        userUUID: req.user.userUUID,
                        notRoomStatus: RoomStatus.Stopped,
                    },
                );
                break;
            }
            case ListType.Today: {
                queryBuilder = queryBuilder.where(
                    `ru.user_uuid = :userUUID
                    AND DATE(r.begin_time) = CURDATE()
                    AND r.room_status <> :notRoomStatus
                    AND ru.is_delete = false
                    AND r.is_delete = false`,
                    {
                        userUUID: req.user.userUUID,
                        notRoomStatus: RoomStatus.Stopped,
                    },
                );
                break;
            }
            case ListType.Periodic: {
                queryBuilder = queryBuilder.where(
                    `ru.user_uuid = :userUUID
                    AND r.room_status <> :notRoomStatus
                    AND length(r.periodic_uuid) <> 0
                    AND ru.is_delete = false
                    AND r.is_delete = false`,
                    {
                        userUUID: req.user.userUUID,
                        notRoomStatus: RoomStatus.Stopped,
                    },
                );
                break;
            }
            case ListType.History: {
                queryBuilder = queryBuilder.where(
                    `ru.user_uuid = :userUUID
                    AND r.room_status = :roomStatus
                    AND ru.is_delete = false
                    AND r.is_delete = false`,
                    {
                        userUUID: req.user.userUUID,
                        roomStatus: RoomStatus.Stopped,
                    },
                );
                break;
            }
        }

        queryBuilder = queryBuilder.orderBy({
            "r.begin_time": type === ListType.History ? "DESC" : "ASC",
        });

        const rooms = await queryBuilder
            .offset((req.query.page - 1) * 50)
            .limit(50)
            .getRawMany();

        const resp: ListResponse = rooms.map((room: Room) => {
            return {
                roomUUID: room.room_uuid,
                periodicUUID: room.periodic_uuid || null,
                ownerUUID: room.owner_uuid,
                roomType: room.room_type,
                title: room.title,
                beginTime: room.begin_time.valueOf(),
                endTime: room.end_time.valueOf(),
                roomStatus: room.room_status,
                ownerName: room.owner_user_name,
            };
        });

        if (type === ListType.History) {
            const roomsUUID = rooms.map((room: Room) => room.room_uuid);

            const roomRecordUUIDs = (
                await RoomRecordDAO().find(
                    ["room_uuid"],
                    {
                        room_uuid: In(roomsUUID),
                    },
                    {
                        distinct: true,
                    },
                )
            ).map(record => record.room_uuid);

            resp.forEach(room => {
                room.hasRecord = roomRecordUUIDs.includes(room.roomUUID);
            });
        }

        return {
            status: Status.Success,
            data: resp,
        };
    } catch (err) {
        logger.error("request failed", parseError(err));
        return {
            status: Status.Failed,
            code: ErrorCode.CurrentProcessFailed,
        };
    }
};

interface ListRequest {
    querystring: {
        page: number;
    };
    params: {
        type: ListType;
    };
}

export const listSchemaType: FastifySchema<ListRequest> = {
    querystring: {
        type: "object",
        required: ["page"],
        properties: {
            page: {
                type: "integer",
                maximum: 50,
                minimum: 1,
            },
        },
    },
    params: {
        type: "object",
        required: ["type"],
        properties: {
            type: {
                type: "string",
                enum: [ListType.All, ListType.Today, ListType.Periodic, ListType.History],
            },
        },
    },
};

type ListResponse = Array<{
    roomUUID: string;
    periodicUUID: string | null;
    roomType: RoomType;
    ownerUUID: string;
    title: string;
    beginTime: number;
    endTime: number;
    roomStatus: RoomStatus;
    ownerName: string;
    hasRecord?: boolean;
}>;

interface Room {
    room_uuid: string;
    periodic_uuid: string;
    owner_uuid: string;
    room_type: RoomType;
    title: string;
    begin_time: Date;
    end_time: Date;
    room_status: RoomStatus;
    owner_user_name: string;
}
