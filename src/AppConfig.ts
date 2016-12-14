interface AppConfig {
  redis: {
    host: string
    port: number
    password: string
    db: string
  }
  telegram: {
    token: string
  }
}

export default AppConfig