# invoice-lambda

Install node v 12

// Setup aws credentials (Make sure it exists on WINDOWS Enviromen Variables)
>AWS_ACCESS_KEY_ID
>AWS_SECRET_ACCESS_KEY

/* Open Program Files->Nod.js->Install Additional Tools... CMD */
//( install all packages from package.json) 
> run npm install 

RUN:

//npm install -g serverless
>-g is running globaly on my maching 

//To deploy:
>sls deploy


/*To run locally:*/     
>sls offline start


/* Commiting */
>git status
>git add package-lock.json | git add .
>git commit -m "update README"\
>git push


