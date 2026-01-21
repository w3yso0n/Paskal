import { Suspense } from "react"
import AlertasClient from "./AlertasClient"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AlertasClient />
    </Suspense>
  )
}
