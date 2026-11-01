export const WIFI_DEVICE_TYPES = [
  'Mobile',
  'Laptop',
  'Desktop',
  'Smart TV',
  'Router',
  'Other',
] as const

export type WiFiDeviceType = (typeof WIFI_DEVICE_TYPES)[number]

