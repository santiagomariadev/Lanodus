declare module "bonjour" {
  type Service = {
    name?: string;
    hostname?: string;
    host?: string;
    port?: number;
    addresses?: string[];
    txt?: Record<string, string>;
  };

  type BonjourInstance = {
    publish: (options: {
      name: string;
      type: string;
      port: number;
      txt?: Record<string, string>;
    }) => { stop: () => void };
    find: (
      options: { type: string },
      callback: (service: Service) => void,
    ) => { stop: () => void };
  };

  export default function bonjour(): BonjourInstance;
}
