import { HaxballGame } from '@/components/haxball-game'
import { HaxballTest } from '@/components/haxball-test'
import { HaxballPhaser } from '@/components/HaxballPhaser'
import Image from 'next/image'

export default function Home () {
  return (
    <main className='flex min-h-screen flex-col items-center justify-between'>
      <HaxballGame />
    </main>
  )
}
