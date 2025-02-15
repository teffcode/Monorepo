import { UserMongooseModel } from "~/core/models/user.server";
import { connectToAppDb } from "~/lib/server/mongoose/connection";
import { NormalizedResponseMongooseModel } from "~/admin/models/normalized_responses/model.server";
import { getUUID } from "~/account/email/api/encryptEmail";

const isSimulation = false;

export const setMissingUUIDs = async ({ limit = 20 }) => {
  limit = Number(limit);
  
  await connectToAppDb();
  let i = 0;
  const result = { duplicateAccountsCount: 0, duplicateUsers: [] };

  const normResponses = await NormalizedResponseMongooseModel.find(
    { userId: { $exists: true }, "user_info.uuid": { $exists: false } },
    null,
    { limit }
  );

  console.log(normResponses.length);

  for (const normResponse of normResponses) {
    if (i % 20 === 0) {
      console.log(`-> Processing normResponse ${i}/${limit}…`);
    }
    const { _id, userId } = normResponse;

    const user = await UserMongooseModel.findOne({ _id: userId });

    const { emailHash } = user;
    const uuid = await getUUID(emailHash, userId);

    const update = await UserMongooseModel.updateOne(
      { _id: userId },
      {
        $set: {
          "user_info.uuid": uuid,
        },
      }
    );

    i++;
  }
  return result;
};

setMissingUUIDs.args = ['limit'];

setMissingUUIDs.description = `Add UUIDs (used for cohort tracking) to normalized responses that lack one. `;

export default setMissingUUIDs;
