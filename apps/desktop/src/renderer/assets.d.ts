/** Vite turns an imported image into the URL it is served from. */
declare module '*.png' {
  const url: string
  export default url
}
