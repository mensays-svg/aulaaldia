const paths: Record<string,string> = {
 grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 book:'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15',
 chart:'M4 3v18h17 M8 16v-4 M13 16V8 M18 16V5',
 scan:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M7 12h10 M9 8v8 M15 8v8',
 calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',
 folder:'M3 7V4h6l2 3h10v13H3z',
 lock:'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
 arrow:'M5 12h14 M13 6l6 6-6 6',
 menu:'M3 6h18 M3 12h18 M3 18h18',
 close:'M6 6l12 12 M18 6 6 18',
 logout:'M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4',
}
export default function Icon({name,className=''}:{name:string;className?:string}){
 return <svg className={'icon '+className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]??paths.book}/></svg>
}
