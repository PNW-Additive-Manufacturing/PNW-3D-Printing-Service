"use server"

import { RequestPartForm} from '@/app/components/RequestPartForm';
import { getFilamentList } from '@/app/api/server-actions/request-part';
import { Filament } from '../dashboard/maintainer/filaments/FilamentTable';

/*
    This MUST be a server component to work because the FilamentSelector is a client side component
    that needs the filement list from a Server Action, which can only be retrieved 
    asyncronously when using a Server Component.

    Client Components cannot render Server Components unless the server component is passed as a prop.

    Note that Client Components CANNOT render async Server Components, even if the async Server
    Component is passed as a prop.
*/

export default async function Request() {
    let filaments = await getFilamentList();

    return (
        <main>
            <div 
                className='w-full lg:w-10/12 xl:w-3/5 bg-white h-fit rounded-md mx-auto p-4 lg:p-10 mt-8'
                style={{maxWidth: "850px"}}
            >
                {/* <h1 className="w-full pb-4 text-right">Request a Print</h1> */}
                <RequestPartForm filaments={filaments as Filament[]}></RequestPartForm>
            </div>

            {/* <StlViewer
                style={style}
                orbitControls={true}
                shadows={true}
                showAxes={true}
                allowFullScreen={true}
                onFinishLoading={onFinishLoading}
                onError={onError}
                onErrorCapture={onError as any}
                url={url}
                modelProps={{

                }}
                floorProps={{
                    gridLength: 4,
                    gridWidth: 4
                }}
            /> */}
        </main>
    )
}