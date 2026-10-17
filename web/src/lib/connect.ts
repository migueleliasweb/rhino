import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { VMService } from "@/gen/rhino/v1/vm_pb";
import { HostService } from "@/gen/rhino/v1/host_pb";
import { HardwareService } from "@/gen/rhino/v1/hardware_pb";

export const transport = createConnectTransport({
  baseUrl: window.location.origin,
});

export const vmClient = createClient(VMService, transport);
export const hostClient = createClient(HostService, transport);
export const hardwareClient = createClient(HardwareService, transport);
