import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const { getExtensions } = await import("yuzai/extensions");
  const extensions = getExtensions();

  return {
    extensions: JSON.stringify(Array.from(extensions)),
  };
};
