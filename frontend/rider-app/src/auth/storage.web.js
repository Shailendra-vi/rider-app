let value = null;
export const sessionStorage = {
  read: async () => value,
  write: async (next) => {
    value = next;
  },
};
