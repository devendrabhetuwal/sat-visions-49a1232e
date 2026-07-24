// Global Window augmentations. Keep the puter shape in ONE place so
// merged declarations across files can't conflict.
export {};

declare global {
  interface Window {
    puter: {
      auth: {
        isSignedIn: () => boolean;
        signIn:     () => Promise<void>;
        signOut:    () => Promise<void>;
        getUser:    () => Promise<{
          username:         string;
          uuid:             string;
          email?:           string;
          email_confirmed?: boolean;
          is_temp_user?:    boolean;
          [key: string]:    unknown;
        }>;
      };
      ai: {
        chat: (
          prompt: string,
          options?: { model?: string; stream?: boolean },
        ) => Promise<{
          message?: { content?: string };
          content?: string;
          text?: string;
          toString(): string;
        }>;
      };
    };
  }
}